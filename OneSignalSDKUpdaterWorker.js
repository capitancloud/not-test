/*
 * OneSignalSDKUpdaterWorker.js
 * ============================
 * 
 * Questo file è il Service Worker di aggiornamento di OneSignal.
 * 
 * RUOLO:
 * - Gestisce gli aggiornamenti del service worker principale
 * - Garantisce transizioni fluide tra versioni
 * - Evita conflitti durante gli update
 * 
 * IMPORTANTE:
 * - Non aggiungere altra logica custom qui
 * - Questo file deve contenere SOLO l'importScripts
 */
importScripts("https://cdn.onesignal.com/sdks/OneSignalSDKUpdaterWorker.js");

