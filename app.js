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
        
        // Disabilita la richiesta automatica del permesso
        // FONDAMENTALE: il permesso deve essere richiesto solo su interazione utente
        autoResubscribe: true,
        
        // Permette le notifiche su HTTP in localhost (per sviluppo)
        allowLocalhostAsSecureOrigin: true
    });
    
    console.log('[OneSignal] SDK inizializzato');
    
    // Aggiorna l'UI in base allo stato corrente delle notifiche
    checkNotificationStatus();
    
    // Listener per cambiamenti nello stato della sottoscrizione
    // Questo viene chiamato quando l'utente si iscrive o disiscrive
    OneSignal.on('subscriptionChange', function(isSubscribed) {
        console.log('[OneSignal] subscriptionChange evento - isSubscribed:', isSubscribed);
        if (isSubscribed) {
            updateUIStatus('subscribed');
        } else {
            updateUIStatus('unsubscribed');
        }
    });
    
    // Listener per quando l'utente accetta/rifiuta le notifiche nel browser
    OneSignal.on('notificationPermissionChange', function(permissionChange) {
        console.log('[OneSignal] notificationPermissionChange evento:', permissionChange);
        
        // permissionChange può essere: 'granted', 'denied', 'default'
        if (permissionChange.to === 'granted') {
            console.log('[OneSignal] Permesso CONCESSO!');
            // Forza aggiornamento UI dopo un breve delay
            setTimeout(() => {
                checkNotificationStatus();
            }, 500);
        } else if (permissionChange.to === 'denied') {
            console.log('[OneSignal] Permesso NEGATO');
            updateUIStatus('denied');
        }
    });
    
    // Listener per quando la registrazione è completata con successo
    OneSignal.on('register', function() {
        console.log('[OneSignal] Registrazione completata con successo!');
        updateUIStatus('subscribed');
    });
});

// ===================================
// Gestione Notifiche
// ===================================

/**
 * Verifica lo stato corrente delle notifiche e aggiorna l'UI
 */
async function checkNotificationStatus() {
    try {
        // Verifica se l'utente è già iscritto
        const isSubscribed = await OneSignal.isPushNotificationsEnabled();
        // Verifica il permesso del browser
        const permission = await OneSignal.getNotificationPermission();
        
        console.log('[PWA] Stato notifiche:', { isSubscribed, permission });
        
        if (isSubscribed) {
            updateUIStatus('subscribed');
        } else if (permission === 'denied') {
            updateUIStatus('denied');
        } else {
            updateUIStatus('default');
        }
    } catch (error) {
        console.error('[PWA] Errore verifica stato notifiche:', error);
        updateUIStatus('error');
    }
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
        // Disabilita temporaneamente il bottone per evitare click multipli
        btnEnableNotifications.disabled = true;
        btnEnableNotifications.querySelector('span').textContent = 'Attivazione...';
        
        console.log('[PWA] Avvio registrazione notifiche...');
        
        /**
         * registerForPushNotifications() mostra direttamente il prompt
         * nativo del browser per le notifiche.
         */
        await OneSignal.registerForPushNotifications();
        
        console.log('[PWA] registerForPushNotifications completato');
        
        // Attendi un momento per permettere a OneSignal di aggiornare lo stato
        // Il browser potrebbe impiegare un attimo a confermare la sottoscrizione
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Verifica lo stato dopo la registrazione
        await checkNotificationStatus();
        
        // Se ancora non risulta iscritto, riprova dopo un altro momento
        const isSubscribed = await OneSignal.isPushNotificationsEnabled();
        console.log('[PWA] Stato iscrizione dopo registrazione:', isSubscribed);
        
        if (isSubscribed) {
            updateUIStatus('subscribed');
        } else {
            // Potrebbe essere che l'utente ha chiuso il prompt senza rispondere
            // Ripristina il bottone
            btnEnableNotifications.disabled = false;
            btnEnableNotifications.querySelector('span').textContent = 'Attiva Notifiche';
        }
        
    } catch (error) {
        console.error('[PWA] Errore attivazione notifiche:', error);
        
        // Ripristina il bottone in caso di errore
        btnEnableNotifications.disabled = false;
        btnEnableNotifications.querySelector('span').textContent = 'Attiva Notifiche';
        
        // Gestisci errori specifici di OneSignal
        const errorMessage = error.message || error.toString();
        
        if (errorMessage.includes('can only be used on')) {
            // Errore di dominio non autorizzato
            updateUIStatus('domain-error');
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
    return /iPhone|iPad|iPod/i.test(navigator.userAgent);
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
        isSecure: window.location.protocol === 'https:' || window.location.hostname === 'localhost'
    });
    
    // Registra il Service Worker PWA per abilitare l'installazione
    // Questo è fondamentale per il prompt beforeinstallprompt
    await registerServiceWorker();
    
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

