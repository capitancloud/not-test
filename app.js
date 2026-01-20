/**
 * app.js - PWA con Notifiche Push OneSignal
 * ==========================================
 * 
 * Funzionalità:
 * - Integrazione OneSignal per notifiche push
 * - Gestione installazione PWA (Android + iOS)
 * - UI reattiva basata sullo stato delle notifiche
 * 
 * Note importanti:
 * - Il permesso notifiche viene richiesto SOLO su click dell'utente
 * - Su iOS le notifiche funzionano solo dalla PWA installata (iOS 16.4+)
 */

// =============================================================================
// CONFIGURAZIONE
// =============================================================================

const CONFIG = {
    oneSignalAppId: '5cc326b1-3a94-4dd0-9d85-791332635fe3',
    serviceWorkerPath: 'OneSignalSDKWorker.js',
    serviceWorkerUpdaterPath: 'OneSignalSDKUpdaterWorker.js'
};

// =============================================================================
// STATO APPLICAZIONE
// =============================================================================

const state = {
    deferredInstallPrompt: null,
    isSubscriptionConfirmed: false
};

// =============================================================================
// ELEMENTI DOM
// =============================================================================

const DOM = {
    btnNotifications: document.getElementById('btn-enable-notifications'),
    notificationStatus: document.getElementById('notification-status'),
    installCard: document.getElementById('install-card'),
    btnInstall: document.getElementById('btn-install')
};

// =============================================================================
// UTILITY - RILEVAMENTO DISPOSITIVO
// =============================================================================

const Device = {
    isMobile: () => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
    
    isIOS: () => /iPhone|iPad|iPod/i.test(navigator.userAgent) || 
                 (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
    
    isAndroid: () => /Android/i.test(navigator.userAgent),
    
    isStandalone: () => window.matchMedia('(display-mode: standalone)').matches || 
                        window.navigator.standalone === true,
    
    supportsPush: () => {
        const hasBasicSupport = 'Notification' in window && 'serviceWorker' in navigator;
        // Su iOS, le notifiche funzionano solo in standalone mode
        if (Device.isIOS() && !Device.isStandalone()) return false;
        return hasBasicSupport;
    }
};

// =============================================================================
// CONFIGURAZIONE STATI UI
// =============================================================================

const UI_STATES = {
    subscribed: {
        badgeClass: 'success',
        statusText: 'Notifiche attive',
        buttonText: 'Notifiche Attive',
        buttonDisabled: true
    },
    denied: {
        badgeClass: 'error',
        statusText: 'Notifiche bloccate nel browser',
        buttonText: 'Notifiche Bloccate',
        buttonDisabled: true
    },
    error: {
        badgeClass: 'warning',
        statusText: 'Errore - Ricarica la pagina',
        buttonText: 'Attiva Notifiche',
        buttonDisabled: false
    },
    'domain-error': {
        badgeClass: 'error',
        statusText: 'Dominio non configurato su OneSignal',
        buttonText: 'Attiva Notifiche',
        buttonDisabled: false
    },
    'ios-install-required': {
        badgeClass: 'warning',
        statusText: 'Installa prima l\'app sulla Home',
        buttonText: 'Installa App per Notifiche',
        buttonDisabled: true
    },
    'not-supported': {
        badgeClass: 'error',
        statusText: 'Notifiche non supportate',
        buttonText: 'Non Supportato',
        buttonDisabled: true
    },
    unsubscribed: {
        badgeClass: 'warning',
        statusText: 'Notifiche disattivate',
        buttonText: 'Riattiva Notifiche',
        buttonDisabled: false
    },
    default: {
        badgeClass: 'hidden',
        statusText: '',
        buttonText: 'Attiva Notifiche',
        buttonDisabled: false
    }
};

// =============================================================================
// UI - AGGIORNAMENTO INTERFACCIA
// =============================================================================

function updateUI(status) {
    const config = UI_STATES[status] || UI_STATES.default;
    const { notificationStatus, btnNotifications } = DOM;
    const statusText = notificationStatus.querySelector('.status-text');
    
    // Aggiorna badge stato
    notificationStatus.classList.remove('success', 'warning', 'error', 'hidden');
    notificationStatus.classList.add(config.badgeClass);
    statusText.textContent = config.statusText;
    
    // Aggiorna bottone
    btnNotifications.disabled = config.buttonDisabled;
    btnNotifications.querySelector('span').textContent = config.buttonText;
}

// =============================================================================
// ONESIGNAL - INIZIALIZZAZIONE E GESTIONE
// =============================================================================

window.OneSignal = window.OneSignal || [];

OneSignal.push(function() {
    // Inizializza SDK
    OneSignal.init({
        appId: CONFIG.oneSignalAppId,
        serviceWorkerPath: CONFIG.serviceWorkerPath,
        serviceWorkerUpdaterPath: CONFIG.serviceWorkerUpdaterPath,
        notifyButton: { enable: false },
        autoResubscribe: true,
        allowLocalhostAsSecureOrigin: true
    });
    
    // Verifica stato iniziale (con delay per dare tempo all'SDK)
    setTimeout(checkNotificationState, 1000);
    
    // Listener per cambiamenti sottoscrizione
    OneSignal.on('subscriptionChange', (isSubscribed) => {
        if (isSubscribed) {
            state.isSubscriptionConfirmed = true;
            updateUI('subscribed');
        }
    });
});

/**
 * Verifica e aggiorna lo stato delle notifiche
 */
async function checkNotificationState() {
    try {
        // Verifica supporto
        if (!Device.supportsPush()) {
            updateUI(Device.isIOS() && !Device.isStandalone() ? 'ios-install-required' : 'not-supported');
            return false;
        }
        
        // Verifica stato OneSignal
        const [isPushEnabled, permission, userId] = await Promise.all([
            OneSignal.isPushNotificationsEnabled(),
            OneSignal.getNotificationPermission(),
            OneSignal.getUserId()
        ]);
        
        if (isPushEnabled || (permission === 'granted' && userId)) {
            state.isSubscriptionConfirmed = true;
            updateUI('subscribed');
        } else if (permission === 'denied') {
            updateUI('denied');
        } else if (!state.isSubscriptionConfirmed) {
            updateUI('default');
        }
        
        return isPushEnabled;
    } catch (error) {
        console.error('[PWA] Errore verifica stato:', error);
        if (Device.isIOS() && !Device.isStandalone()) {
            updateUI('ios-install-required');
        } else if (!state.isSubscriptionConfirmed) {
            updateUI('error');
        }
        return false;
    }
}

/**
 * Gestisce l'attivazione delle notifiche
 */
async function handleNotificationClick() {
    // Verifica supporto
    if (!Device.supportsPush()) {
        updateUI(Device.isIOS() && !Device.isStandalone() ? 'ios-install-required' : 'not-supported');
        return;
    }
    
    // UI feedback
    DOM.btnNotifications.disabled = true;
    DOM.btnNotifications.querySelector('span').textContent = 'Attivazione...';
    
    try {
        await OneSignal.registerForPushNotifications();
        
        const permission = await OneSignal.getNotificationPermission();
        
        if (permission === 'granted') {
            state.isSubscriptionConfirmed = true;
            updateUI('subscribed');
        } else if (permission === 'denied') {
            updateUI('denied');
        } else {
            // Prompt chiuso senza risposta
            DOM.btnNotifications.disabled = false;
            DOM.btnNotifications.querySelector('span').textContent = 'Attiva Notifiche';
        }
    } catch (error) {
        console.error('[PWA] Errore attivazione:', error);
        
        DOM.btnNotifications.disabled = false;
        DOM.btnNotifications.querySelector('span').textContent = 'Attiva Notifiche';
        
        const errorMsg = error.message || '';
        if (errorMsg.includes('can only be used on')) {
            updateUI('domain-error');
        } else if (Device.isIOS() && !Device.isStandalone()) {
            updateUI('ios-install-required');
        } else {
            updateUI('error');
        }
    }
}

// =============================================================================
// PWA - INSTALLAZIONE
// =============================================================================

/**
 * Mostra istruzioni manuali per installazione
 */
function showInstallInstructions() {
    const instructions = Device.isIOS()
        ? '📱 Per installare l\'app:\n\n1. Tocca l\'icona Condividi (quadrato con freccia)\n2. Scorri e tocca "Aggiungi a Home"\n3. Conferma toccando "Aggiungi"'
        : Device.isAndroid()
        ? '📱 Per installare l\'app:\n\n1. Tocca il menu (⋮) in alto a destra\n2. Tocca "Installa app" o "Aggiungi a schermata Home"\n3. Conferma l\'installazione'
        : '💻 Per installare l\'app:\n\nCerca l\'opzione "Installa" nel menu del browser o nella barra degli indirizzi.';
    
    alert(instructions);
}

/**
 * Gestisce il click sul bottone installa
 */
async function handleInstallClick() {
    if (!state.deferredInstallPrompt) {
        showInstallInstructions();
        return;
    }
    
    try {
        state.deferredInstallPrompt.prompt();
        const { outcome } = await state.deferredInstallPrompt.userChoice;
        
        if (outcome === 'accepted') {
            DOM.installCard.classList.add('hidden');
        }
        state.deferredInstallPrompt = null;
    } catch (error) {
        console.error('[PWA] Errore installazione:', error);
    }
}

/**
 * Configura la card di installazione per dispositivi mobili
 */
function setupInstallCard() {
    // Nascondi se già installata
    if (Device.isStandalone()) {
        DOM.installCard.classList.add('hidden');
        return;
    }
    
    // Mostra su mobile
    if (Device.isMobile()) {
        DOM.installCard.classList.remove('hidden');
        DOM.btnInstall.querySelector('span').textContent = Device.isIOS() ? 'Aggiungi a Home' : 'Installa App';
    }
}

// =============================================================================
// EVENT LISTENERS
// =============================================================================

// Notifiche
DOM.btnNotifications.addEventListener('click', handleNotificationClick);

// Installazione
DOM.btnInstall.addEventListener('click', handleInstallClick);

// Intercetta evento installazione nativo
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.deferredInstallPrompt = e;
    
    DOM.installCard.classList.remove('hidden');
    DOM.btnInstall.querySelector('span').textContent = 'Installa sulla Home';
});

// App installata
window.addEventListener('appinstalled', () => {
    DOM.installCard.classList.add('hidden');
    state.deferredInstallPrompt = null;
});

// =============================================================================
// INIZIALIZZAZIONE
// =============================================================================

function init() {
    // Verifica supporto base
    if (!('serviceWorker' in navigator) || !('Notification' in window)) {
        console.warn('[PWA] Browser non supporta le funzionalità richieste');
        updateUI('not-supported');
        return;
    }
    
    // Setup per iOS senza PWA
    if (Device.isIOS() && !Device.isStandalone()) {
        updateUI('ios-install-required');
    }
    
    // Setup card installazione
    setupInstallCard();
}

// Avvia app
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
