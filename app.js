/**
 * app.js
 * ======
 * Script principale per la PWA con notifiche push OneSignal
 * 
 * Questo file gestisce:
 * 1. Inizializzazione OneSignal (Custom Code)
 * 2. Gestione del bottone "Attiva Notifiche"
 * 3. Gestione dell'installazione PWA
 * 4. Aggiornamento dell'interfaccia in base allo stato
 * 
 * IMPORTANTE - Perché NON chiediamo il permesso notifiche on-load:
 * ---------------------------------------------------------------
 * 1. Browser penalizzano i siti che chiedono permessi senza interazione
 * 2. L'utente non ha ancora capito il valore dell'app
 * 3. Tasso di accettazione molto più basso
 * 4. Chrome può bloccare automaticamente richieste non user-initiated
 * 5. È considerata una pratica anti-pattern per la UX
 * 
 * La richiesta DEVE sempre partire da un click esplicito dell'utente.
 */

// ===================================
// Configurazione
// ===================================

/**
 * INSERISCI QUI IL TUO APP ID ONESIGNAL
 * Puoi trovarlo nella dashboard OneSignal:
 * Settings > Keys & IDs > OneSignal App ID
 */
const ONESIGNAL_APP_ID = "5cc326b1-3a94-4dd0-9d85-791332635fe3";

// ===================================
// Elementi DOM
// ===================================

const btnEnableNotifications = document.getElementById('btn-enable-notifications');
const notificationStatus = document.getElementById('notification-status');
const installCard = document.getElementById('install-card');
const btnInstall = document.getElementById('btn-install');

// ===================================
// Variabili di stato
// ===================================

/**
 * Evento di installazione PWA
 * Viene intercettato quando il browser rileva che l'app può essere installata
 */
let deferredInstallPrompt = null;

// ===================================
// Inizializzazione OneSignal
// ===================================

/**
 * Inizializza OneSignal SDK in modalità Custom Code
 * 
 * NOTA IMPORTANTE:
 * - NON usiamo il codice auto-generato dalla dashboard
 * - Configuriamo manualmente tutti i parametri
 * - notifyButton è disabilitato (usiamo il nostro bottone custom)
 * 
 * Il Service Worker di OneSignal:
 * - Gestisce la ricezione delle push notifications in background
 * - Si registra automaticamente quando l'utente accetta le notifiche
 * - Non richiede logica custom - OneSignal gestisce tutto
 */
window.OneSignal = window.OneSignal || [];

/**
 * Flag per evitare che lo stato venga sovrascritto dopo la sottoscrizione
 */
let isSubscriptionConfirmed = false;

OneSignal.push(function() {
    OneSignal.init({
        // ID dell'applicazione OneSignal (obbligatorio)
        appId: ONESIGNAL_APP_ID,
        
        // Path ai service worker OneSignal
        // Questi file devono essere nella root del sito
        serviceWorkerPath: "OneSignalSDKWorker.js",
        serviceWorkerUpdaterPath: "OneSignalSDKUpdaterWorker.js",
        
        // Disabilita il bottone di notifica built-in di OneSignal
        // Useremo il nostro bottone custom per una UX migliore
        notifyButton: {
            enable: false
        },
        
        // Abilita auto-resubscribe per utenti che hanno già accettato
        autoResubscribe: true,
        
        // Permette le notifiche su HTTP in localhost (per sviluppo)
        allowLocalhostAsSecureOrigin: true
    });
    
    console.log('[OneSignal] SDK inizializzato');
    
    // Verifica stato iniziale dopo un breve delay per dare tempo all'SDK
    setTimeout(async () => {
        await checkAndUpdateStatus();
    }, 1000);
    
    // Listener PRINCIPALE per cambiamenti nello stato della sottoscrizione
    OneSignal.on('subscriptionChange', function(isSubscribed) {
        console.log('[OneSignal] 🔔 subscriptionChange:', isSubscribed);
        
        if (isSubscribed) {
            isSubscriptionConfirmed = true;
            updateUIStatus('subscribed');
        }
        // NON aggiorniamo a 'unsubscribed' automaticamente per evitare flicker
        // Lo facciamo solo se l'utente esplicitamente si disiscrive
    });
});

// ===================================
// Gestione Notifiche
// ===================================

/**
 * Verifica e aggiorna lo stato delle notifiche
 * Funzione principale per la verifica dello stato
 */
async function checkAndUpdateStatus() {
    try {
        // Prima verifica se le notifiche sono supportate
        if (!arePushNotificationsSupported()) {
            console.log('[PWA] ⚠️ Push non supportate su questo dispositivo');
            
            if (isIOS() && !isAppInstalled()) {
                updateUIStatus('ios-install-required');
            } else {
                updateUIStatus('not-supported');
            }
            return false;
        }
        
        // Usa le API di OneSignal per verificare lo stato
        const isPushEnabled = await OneSignal.isPushNotificationsEnabled();
        const permission = await OneSignal.getNotificationPermission();
        const userId = await OneSignal.getUserId();
        
        console.log('[PWA] 📊 Stato completo:', { 
            isPushEnabled, 
            permission, 
            userId,
            isSubscriptionConfirmed 
        });
        
        // Se abbiamo un userId e il permesso è granted, siamo iscritti
        if (isPushEnabled || (permission === 'granted' && userId)) {
            isSubscriptionConfirmed = true;
            updateUIStatus('subscribed');
        } else if (permission === 'denied') {
            updateUIStatus('denied');
        } else if (!isSubscriptionConfirmed) {
            // Solo se non abbiamo già confermato la sottoscrizione
            updateUIStatus('default');
        }
        
        return isPushEnabled;
    } catch (error) {
        console.error('[PWA] Errore verifica stato:', error);
        
        // Su iOS senza PWA, mostra messaggio appropriato invece di errore generico
        if (isIOS() && !isAppInstalled()) {
            updateUIStatus('ios-install-required');
        } else if (!isSubscriptionConfirmed) {
            updateUIStatus('error');
        }
        return false;
    }
}

/**
 * Alias per compatibilità
 */
async function checkNotificationStatus() {
    return checkAndUpdateStatus();
}

/**
 * Aggiorna l'interfaccia in base allo stato delle notifiche
 * 
 * @param {string} status - Lo stato corrente: 'subscribed', 'denied', 'default', 'error'
 */
function updateUIStatus(status) {
    const statusBadge = notificationStatus;
    const statusText = statusBadge.querySelector('.status-text');
    const button = btnEnableNotifications;
    
    // Rimuovi classi precedenti
    statusBadge.classList.remove('success', 'warning', 'error', 'hidden');
    
    switch (status) {
        case 'subscribed':
            // Utente iscritto alle notifiche
            statusBadge.classList.add('success');
            statusText.textContent = 'Notifiche attive';
            button.disabled = true;
            button.querySelector('span').textContent = 'Notifiche Attive';
            break;
            
        case 'denied':
            // Utente ha rifiutato le notifiche nel browser
            statusBadge.classList.add('error');
            statusText.textContent = 'Notifiche bloccate nel browser';
            button.disabled = true;
            button.querySelector('span').textContent = 'Notifiche Bloccate';
            break;
            
        case 'error':
            // Errore generico
            statusBadge.classList.add('warning');
            statusText.textContent = 'Errore - Ricarica la pagina';
            button.disabled = false;
            break;
            
        case 'domain-error':
            // Dominio non autorizzato su OneSignal
            statusBadge.classList.add('error');
            statusText.textContent = 'Dominio non configurato su OneSignal';
            button.disabled = false;
            break;
            
        case 'ios-install-required':
            // iOS richiede installazione PWA prima delle notifiche
            statusBadge.classList.add('warning');
            statusText.textContent = 'Installa prima l\'app sulla Home';
            button.disabled = true;
            button.querySelector('span').textContent = 'Installa App per Notifiche';
            break;
            
        case 'not-supported':
            // Browser non supporta le notifiche push
            statusBadge.classList.add('error');
            statusText.textContent = 'Notifiche non supportate';
            button.disabled = true;
            button.querySelector('span').textContent = 'Non Supportato';
            break;
            
        case 'unsubscribed':
            // Utente si è disiscritto
            statusBadge.classList.add('warning');
            statusText.textContent = 'Notifiche disattivate';
            button.disabled = false;
            button.querySelector('span').textContent = 'Riattiva Notifiche';
            break;
            
        default:
            // Stato iniziale - permesso non ancora richiesto
            statusBadge.classList.add('hidden');
            button.disabled = false;
            button.querySelector('span').textContent = 'Attiva Notifiche';
    }
}

/**
 * Handler per il click sul bottone "Attiva Notifiche"
 * 
 * IMPORTANTE:
 * Questa funzione usa registerForPushNotifications() per mostrare
 * direttamente il prompt nativo del browser.
 * 
 * NOTA: showSlidedownPrompt() richiede configurazione sulla dashboard OneSignal.
 * Se vuoi usare lo slidedown, devi:
 * 1. Andare su OneSignal Dashboard > Settings > Push Prompts
 * 2. Abilitare e configurare lo Slide Prompt
 * 
 * Il flusso attuale:
 * 1. Utente clicca il bottone (interazione esplicita)
 * 2. Viene mostrato il prompt nativo del browser
 * 3. Se l'utente accetta, viene iscritto alle notifiche
 */
async function handleEnableNotifications() {
    try {
        // Verifica se le notifiche sono supportate
        if (!arePushNotificationsSupported()) {
            console.log('[PWA] ⚠️ Notifiche non supportate su questo dispositivo/browser');
            
            if (isIOS() && !isAppInstalled()) {
                // iOS: l'utente deve prima installare la PWA
                updateUIStatus('ios-install-required');
                return;
            } else {
                updateUIStatus('not-supported');
                return;
            }
        }
        
        // Disabilita temporaneamente il bottone per evitare click multipli
        btnEnableNotifications.disabled = true;
        btnEnableNotifications.querySelector('span').textContent = 'Attivazione...';
        
        console.log('[PWA] 🚀 Avvio registrazione notifiche...');
        
        /**
         * registerForPushNotifications() mostra direttamente il prompt
         * nativo del browser per le notifiche.
         */
        await OneSignal.registerForPushNotifications();
        
        console.log('[PWA] ✅ registerForPushNotifications completato');
        
        // Verifica il permesso del browser
        const permission = await OneSignal.getNotificationPermission();
        console.log('[PWA] Permesso browser:', permission);
        
        if (permission === 'granted') {
            // L'utente ha accettato! Imposta lo stato come confermato
            isSubscriptionConfirmed = true;
            updateUIStatus('subscribed');
            
            // Verifica anche con getUserId per conferma
            const userId = await OneSignal.getUserId();
            console.log('[PWA] 🆔 User ID OneSignal:', userId);
            
            if (userId) {
                console.log('[PWA] ✅ Iscrizione confermata con userId:', userId);
            }
        } else if (permission === 'denied') {
            updateUIStatus('denied');
        } else {
            // L'utente ha chiuso il prompt senza rispondere
            btnEnableNotifications.disabled = false;
            btnEnableNotifications.querySelector('span').textContent = 'Attiva Notifiche';
        }
        
    } catch (error) {
        console.error('[PWA] ❌ Errore attivazione notifiche:', error);
        
        // Ripristina il bottone in caso di errore
        btnEnableNotifications.disabled = false;
        btnEnableNotifications.querySelector('span').textContent = 'Attiva Notifiche';
        
        // Gestisci errori specifici
        const errorMessage = error.message || error.toString();
        
        if (errorMessage.includes('can only be used on')) {
            // Errore di dominio non autorizzato
            updateUIStatus('domain-error');
        } else if (isIOS() && !isAppInstalled()) {
            // iOS senza PWA installata
            updateUIStatus('ios-install-required');
        } else {
            // Mostra messaggio di errore generico
            updateUIStatus('error');
        }
    }
}

// Event listener per il bottone notifiche
btnEnableNotifications.addEventListener('click', handleEnableNotifications);

// ===================================
// Gestione Installazione PWA
// ===================================

/**
 * Rileva se l'utente è su un dispositivo mobile
 * Usato per mostrare la card di installazione anche senza beforeinstallprompt
 */
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * Rileva se l'utente è su iOS (iPhone/iPad)
 * iOS non supporta beforeinstallprompt, serve un approccio diverso
 */
function isIOS() {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent) || 
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Verifica se le notifiche push sono supportate su questo dispositivo/browser
 * 
 * Su iOS:
 * - Le notifiche web funzionano SOLO da iOS 16.4+
 * - SOLO quando l'app è installata come PWA (standalone mode)
 * - NON funzionano da Safari normale
 */
function arePushNotificationsSupported() {
    // Verifica supporto base
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
        return false;
    }
    
    // Su iOS, le notifiche funzionano solo in standalone mode (PWA installata)
    if (isIOS() && !isAppInstalled()) {
        return false;
    }
    
    return true;
}

/**
 * Rileva se l'utente è su Android
 */
function isAndroid() {
    return /Android/i.test(navigator.userAgent);
}

/**
 * Rileva se l'app è già installata (modalità standalone)
 * In questo caso non mostriamo la card di installazione
 */
function isAppInstalled() {
    // Controlla display-mode standalone (Android/Desktop)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    // Controlla navigator.standalone (iOS Safari)
    const isIOSStandalone = window.navigator.standalone === true;
    
    return isStandalone || isIOSStandalone;
}

/**
 * Mostra istruzioni manuali per l'installazione
 * Usato come fallback quando beforeinstallprompt non è disponibile
 */
function showManualInstallInstructions() {
    if (isIOS()) {
        // Istruzioni per iOS Safari
        alert(
            '📱 Per installare l\'app:\n\n' +
            '1. Tocca l\'icona Condividi (quadrato con freccia in basso)\n' +
            '2. Scorri verso il basso\n' +
            '3. Tocca "Aggiungi a Home"\n' +
            '4. Conferma toccando "Aggiungi"'
        );
    } else if (isAndroid()) {
        // Istruzioni per Android Chrome
        alert(
            '📱 Per installare l\'app:\n\n' +
            '1. Tocca il menu (⋮) in alto a destra\n' +
            '2. Tocca "Installa app" o "Aggiungi a schermata Home"\n' +
            '3. Conferma l\'installazione'
        );
    } else {
        // Istruzioni generiche
        alert(
            '💻 Per installare l\'app:\n\n' +
            'Cerca l\'opzione "Installa" nel menu del browser\n' +
            'o nella barra degli indirizzi.'
        );
    }
}

/**
 * Mostra la card di installazione su dispositivi mobili
 * Viene chiamata all'avvio per garantire che la CTA sia sempre visibile
 * 
 * Su Android: il browser potrebbe emettere beforeinstallprompt, ma lo mostriamo
 * comunque per dare più visibilità all'opzione di installazione
 * 
 * Su iOS: beforeinstallprompt non esiste, quindi mostriamo sempre istruzioni manuali
 */
function showInstallCardOnMobile() {
    console.log('[PWA] Verifica installazione mobile...', {
        isMobile: isMobileDevice(),
        isInstalled: isAppInstalled(),
        isIOS: isIOS(),
        isAndroid: isAndroid()
    });
    
    // Non mostrare se l'app è già installata
    if (isAppInstalled()) {
        console.log('[PWA] App già installata, nascondo card');
        installCard.classList.add('hidden');
        return;
    }
    
    // Su mobile, mostra sempre la card di installazione
    if (isMobileDevice()) {
        console.log('[PWA] Dispositivo mobile rilevato, mostro card installazione');
        installCard.classList.remove('hidden');
        
        // Se non c'è il prompt automatico (iOS o Android senza evento)
        // configura il bottone per mostrare istruzioni manuali
        if (!deferredInstallPrompt) {
            const btnText = btnInstall.querySelector('span');
            
            if (isIOS()) {
                btnText.textContent = 'Aggiungi a Home';
            } else {
                btnText.textContent = 'Installa App';
            }
            
            // Imposta handler per istruzioni manuali
            btnInstall.onclick = showManualInstallInstructions;
        }
    }
}

/**
 * Intercetta l'evento beforeinstallprompt
 * 
 * Questo evento viene emesso dal browser quando:
 * 1. Il sito ha un manifest.json valido
 * 2. È servito via HTTPS (o localhost)
 * 3. Ha un service worker registrato
 * 4. L'utente non ha già installato l'app
 * 
 * NOTA: iOS Safari NON supporta questo evento!
 * Per iOS usiamo showInstallCardOnMobile() con istruzioni manuali
 * 
 * Salvando l'evento, possiamo mostrare il prompt di installazione
 * in un momento più appropriato (es. dopo un click su un bottone)
 */
window.addEventListener('beforeinstallprompt', (event) => {
    console.log('[PWA] Evento beforeinstallprompt intercettato');
    
    // Previeni il prompt automatico del browser (mini-infobar)
    event.preventDefault();
    
    // Salva l'evento per usarlo dopo
    deferredInstallPrompt = event;
    
    // Mostra la card di installazione
    installCard.classList.remove('hidden');
    
    // Ripristina il testo e l'handler originale del bottone
    // (potrebbe essere stato modificato da showInstallCardOnMobile)
    btnInstall.querySelector('span').textContent = 'Installa sulla Home';
    btnInstall.onclick = handleInstallClick;
});

/**
 * Handler per il click sul bottone "Installa"
 * 
 * Mostra il prompt di installazione nativo del browser
 */
async function handleInstallClick() {
    if (!deferredInstallPrompt) {
        console.log('[PWA] Nessun prompt di installazione disponibile');
        return;
    }
    
    try {
        // Mostra il prompt di installazione
        deferredInstallPrompt.prompt();
        
        // Attendi la scelta dell'utente
        const choiceResult = await deferredInstallPrompt.userChoice;
        
        console.log('[PWA] Scelta installazione:', choiceResult.outcome);
        
        if (choiceResult.outcome === 'accepted') {
            // L'utente ha accettato l'installazione
            console.log('[PWA] App installata con successo');
        }
        
        // L'evento può essere usato solo una volta
        deferredInstallPrompt = null;
        
        // Nascondi la card di installazione
        installCard.classList.add('hidden');
        
    } catch (error) {
        console.error('[PWA] Errore installazione:', error);
    }
}

// Event listener per il bottone installazione
btnInstall.addEventListener('click', handleInstallClick);

/**
 * Listener per quando l'app viene effettivamente installata
 */
window.addEventListener('appinstalled', (event) => {
    console.log('[PWA] App installata!', event);
    
    // Nascondi la card di installazione
    installCard.classList.add('hidden');
    
    // Resetta la variabile
    deferredInstallPrompt = null;
});

// ===================================
// Verifica Supporto e Inizializzazione
// ===================================

/**
 * Verifica che il browser supporti le funzionalità richieste
 */
function checkBrowserSupport() {
    const support = {
        serviceWorker: 'serviceWorker' in navigator,
        pushManager: 'PushManager' in window,
        notification: 'Notification' in window
    };
    
    console.log('[PWA] Supporto browser:', support);
    
    if (!support.serviceWorker) {
        console.warn('[PWA] Service Worker non supportato');
        updateUIStatus('error');
        return false;
    }
    
    if (!support.pushManager || !support.notification) {
        console.warn('[PWA] Push notifications non supportate');
        updateUIStatus('error');
        return false;
    }
    
    return true;
}

/**
 * Registra il service worker PWA
 * 
 * Questo SW gestisce:
 * - Caching delle risorse per funzionamento offline
 * - Garantisce l'installabilità della PWA
 * 
 * NOTA: OneSignal registra separatamente il proprio service worker
 * per le notifiche push. I due SW coesistono.
 */
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js', {
                scope: '/'
            });
            
            console.log('[PWA] Service Worker registrato con successo:', registration.scope);
            
            // Gestisci aggiornamenti del SW
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                console.log('[PWA] Nuovo Service Worker trovato, installazione...');
                
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        console.log('[PWA] Nuovo Service Worker installato, aggiorna la pagina');
                    }
                });
            });
            
        } catch (error) {
            console.error('[PWA] Errore registrazione Service Worker:', error);
        }
    }
}

// ===================================
// Avvio Applicazione
// ===================================

/**
 * Funzione di inizializzazione principale
 */
async function init() {
    console.log('[PWA] Inizializzazione app...');
    
    // Verifica supporto browser
    if (!checkBrowserSupport()) {
        console.error('[PWA] Browser non supportato');
        return;
    }
    
    // Log info ambiente
    console.log('[PWA] Ambiente:', {
        hostname: window.location.hostname,
        protocol: window.location.protocol,
        isSecure: window.location.protocol === 'https:' || window.location.hostname === 'localhost',
        isIOS: isIOS(),
        isAppInstalled: isAppInstalled(),
        pushSupported: arePushNotificationsSupported()
    });
    
    // Su iOS senza PWA installata, mostra subito il messaggio appropriato
    if (isIOS() && !isAppInstalled()) {
        console.log('[PWA] 📱 iOS rilevato senza PWA installata');
        updateUIStatus('ios-install-required');
    }
    
    // Mostra card installazione su dispositivi mobili
    // Questo garantisce che la CTA sia visibile anche su iOS
    // dove beforeinstallprompt non viene mai emesso
    showInstallCardOnMobile();
    
    console.log('[PWA] App inizializzata con successo');
}

// Avvia l'app quando il DOM è pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

