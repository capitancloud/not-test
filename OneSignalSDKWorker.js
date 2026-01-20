/*
 * OneSignalSDKWorker.js
 * =====================
 * 
 * Questo file è il Service Worker principale di OneSignal.
 * 
 * IMPORTANTE:
 * - Non aggiungere altra logica custom qui
 * - OneSignal gestisce internamente la Push API
 * - Questo file deve contenere SOLO l'importScripts
 * 
 * Il service worker di OneSignal si occupa di:
 * - Ricevere le notifiche push in background
 * - Mostrare le notifiche all'utente
 * - Gestire i click sulle notifiche
 * - Sincronizzare lo stato delle sottoscrizioni
 */
importScripts("https://cdn.onesignal.com/sdks/OneSignalSDKWorker.js");

