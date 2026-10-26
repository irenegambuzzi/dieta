/* =====================================================================
   Dieta — app
   Sito statico: niente build. Supabase JS è in /vendor.
   ===================================================================== */
(function () {
  "use strict";

  const cfg = window.DIETA_CONFIG;
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: {
      persistSession: true,        // la sessione resta salvata nel browser
      autoRefreshToken: true,      // il token viene rinnovato prima della scadenza
      detectSessionInUrl: false,
      storageKey: "dieta-sessione",
      storage: window.localStorage,
    },
  });

  const $ = (sel) => document.querySelector(sel);
  const SEZIONI = ["oggi", "peso", "ricette", "spesa", "impostazioni"];

  // -------------------------------------------------------------------
  // Sessione: niente "JWT expired"
  // Su iPhone i timer si fermano quando l'app è in background, quindi il
  // rinnovo automatico può saltare. Al ritorno in primo piano riavviamo il
  // rinnovo e controlliamo subito il token; ogni chiamata al database passa
  // da db(), che rinnova il token se sta per scadere e riprova una volta
  // se il server risponde comunque "JWT expired".
  // -------------------------------------------------------------------
  const MARGINE_MS = 90 * 1000;

  async function sessioneFresca() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return null;
    if (session.expires_at * 1000 - Date.now() > MARGINE_MS) return session;
    const { data, error } = await sb.auth.refreshSession();
    if (error) return null;
    return data.session;
  }

  function tokenScaduto(error) {
    if (!error) return false;
    const testo = `${error.code || ""} ${error.message || ""}`;
    return /PGRST30[13]|JWT expired|jwt expired|invalid JWT/i.test(testo) || error.status === 401;
  }

  async function db(operazione) {
    await sessioneFresca();
    let risposta = await operazione(sb);
    if (tokenScaduto(risposta.error)) {
      const { error } = await sb.auth.refreshSession();
      if (error) { mostraLogin(); return risposta; }
      risposta = await operazione(sb);
    }
    return risposta;
  }

  function quandoTorniVisibile() {
    if (document.visibilityState === "visible") {
      sb.auth.startAutoRefresh();
      sessioneFresca().then((s) => { if (!s && !$("#vista-app").hidden) mostraLogin(); });
    } else {
      sb.auth.stopAutoRefresh();
    }
  }
  document.addEventListener("visibilitychange", quandoTorniVisibile);
  window.addEventListener("pageshow", (e) => { if (e.persisted) quandoTorniVisibile(); });
  window.addEventListener("online", () => sessioneFresca());

  // -------------------------------------------------------------------
  // Viste
  // -------------------------------------------------------------------
  function nascondiAvvio() { $("#avvio").hidden = true; }

  function mostraLogin() {
    $("#vista-app").hidden = true;
    $("#vista-login").hidden = false;
    nascondiAvvio();
  }

  let caricata = false;
  function mostraApp(session) {
    $("#vista-login").hidden = true;
    $("#vista-app").hidden = false;
    nascondiAvvio();
    $("#account-email").textContent = session.user.email;
    aggiornaInfoSessione(session);
    vaiA(sezioneDaHash());
    if (!caricata) { caricata = true; caricaDati(); }
  }

  function aggiornaInfoSessione(session) {
    if (!session) return;
    const scade = new Date(session.expires_at * 1000);
    const ora = scade.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    $("#account-sessione").textContent = `attiva · rinnovo automatico (prossimo ${ora})`;
  }

  // -------------------------------------------------------------------
  // Navigazione
  // -------------------------------------------------------------------
  function sezioneDaHash() {
    const h = location.hash.replace("#", "");
    return SEZIONI.includes(h) ? h : "oggi";
  }

  function vaiA(nome) {
    document.querySelectorAll(".sezione").forEach((s) => { s.hidden = s.dataset.sezione !== nome; });
    document.querySelectorAll(".barra a").forEach((a) => {
      if (a.dataset.vai === nome) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", () => vaiA(sezioneDaHash()));

  // -------------------------------------------------------------------
  // Dati (per ora: solo obiettivi, per verificare che il database risponda)
  // -------------------------------------------------------------------
  const fmt = (n) => Number(n).toLocaleString("it-IT", { maximumFractionDigits: 1 });

  function barra(nome, consumato, obiettivo, unita, classe = "") {
    const perc = obiettivo > 0 ? Math.min(100, (consumato / obiettivo) * 100) : 0;
    return `
      <div class="barra-macro ${classe}">
        <div class="riga">
          <span class="nome">${nome}</span>
          <span class="valori"><b>${fmt(consumato)}</b> / ${fmt(obiettivo)} ${unita}</span>
        </div>
        <div class="binario"><div class="riempimento" style="width:${perc}%"></div></div>
      </div>`;
  }

  async function caricaDati() {
    const { data: imp, error } = await db((c) => c.from("impostazioni").select("*").maybeSingle());
    if (error || !imp) {
      $("#barre-macro").innerHTML = `<p class="segnaposto">Non riesco a leggere gli obiettivi${error ? ": " + error.message : ""}.</p>`;
      return;
    }
    const consumati = { kcal: 0, p: 0, c: 0, g: 0 };   // arriveranno dal diario

    $("#kcal-rimanenti").textContent = fmt(Math.max(0, imp.kcal_obiettivo - consumati.kcal));
    $("#kcal-obiettivo").textContent = fmt(imp.kcal_obiettivo);
    $("#barre-macro").innerHTML =
      barra("Proteine", consumati.p, imp.proteine_obiettivo_g, "g") +
      barra("Carboidrati", consumati.c, imp.carboidrati_obiettivo_g, "g") +
      barra("Grassi", consumati.g, imp.grassi_obiettivo_g, "g");
    $("#acqua-obiettivo").textContent = imp.acqua_obiettivo_bicchieri;

    $("#elenco-obiettivi").innerHTML = [
      ["Calorie", `${fmt(imp.kcal_obiettivo)} kcal`],
      ["Proteine", `${fmt(imp.proteine_obiettivo_g)} g`],
      ["Carboidrati", `${fmt(imp.carboidrati_obiettivo_g)} g`],
      ["Grassi", `${fmt(imp.grassi_obiettivo_g)} g`],
      ["Acqua", `${imp.acqua_obiettivo_bicchieri} bicchieri da ${imp.bicchiere_ml} ml`],
    ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
  }

  function scriviDate() {
    const oggi = new Date();
    $("#oggi-data").textContent = oggi.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
    const lun = new Date(oggi);
    lun.setDate(oggi.getDate() - ((oggi.getDay() + 6) % 7));
    $("#spesa-settimana").textContent = "Settimana del " + lun.toLocaleDateString("it-IT", { day: "numeric", month: "long" });
  }

  // -------------------------------------------------------------------
  // Login / logout
  // -------------------------------------------------------------------
  $("#form-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errore = $("#login-errore");
    const bottone = $("#login-invia");
    errore.hidden = true;
    bottone.disabled = true;
    bottone.textContent = "Entro…";

    const { error } = await sb.auth.signInWithPassword({
      email: $("#login-email").value.trim(),
      password: $("#login-password").value,
    });

    bottone.disabled = false;
    bottone.textContent = "Entra";
    if (error) {
      errore.textContent = error.message === "Invalid login credentials"
        ? "Email o password non corrette."
        : "Accesso non riuscito: " + error.message;
      errore.hidden = false;
      return;
    }
    $("#login-password").value = "";
  });

  $("#esci").addEventListener("click", async () => {
    await sb.auth.signOut();
    caricata = false;
  });

  sb.auth.onAuthStateChange((evento, session) => {
    // la callback non deve essere async (consiglio di supabase-js): rimandiamo il lavoro
    setTimeout(() => {
      if (session) {
        if (evento === "TOKEN_REFRESHED") aggiornaInfoSessione(session);
        else mostraApp(session);
      } else {
        mostraLogin();
      }
    }, 0);
  });

  // Avvio
  scriviDate();
  sessioneFresca().then((s) => (s ? mostraApp(s) : mostraLogin()));
})();
