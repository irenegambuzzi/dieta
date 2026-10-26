/* =====================================================================
   Dieta — nucleo
   Sito statico: niente build. Supabase JS è in /vendor.
   Qui: sessione, navigazione, finestre (fogli), dati condivisi e calcoli.
   Le sezioni sono in js/oggi.js, js/peso.js, js/cucina.js, js/spesa.js,
   js/impostazioni.js e si registrano con D.sezione(nome, { carica }).
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

  const $ = (sel, dentro = document) => dentro.querySelector(sel);
  const $$ = (sel, dentro = document) => Array.from(dentro.querySelectorAll(sel));
  const SEZIONI = ["oggi", "peso", "cucina", "spesa", "impostazioni"];

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

  // Come db(), ma restituisce i dati e lancia un errore leggibile.
  async function dati(operazione) {
    const { data, error } = await db(operazione);
    if (error) throw erroreLeggibile(error);
    return data;
  }

  function erroreLeggibile(error) {
    const e = new Error(error.message || String(error));
    e.code = error.code;
    if (error.code === "23503") e.message = "è ancora usato altrove (piano, ricette o diario): puoi archiviarlo invece di eliminarlo";
    else if (error.code === "23505") e.message = "esiste già";
    else if (error.code === "23514") e.message = "un valore non è valido";
    else if (/Failed to fetch|NetworkError|Load failed/i.test(e.message)) e.message = "connessione assente, riprova";
    return e;
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
  // Formati, date, numeri
  // -------------------------------------------------------------------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n, dec = 1) => Number(n || 0).toLocaleString("it-IT", { maximumFractionDigits: dec });
  const arr1 = (n) => Math.round(Number(n || 0) * 10) / 10;

  // Accetta "62,5" e "62.5". Restituisce null se vuoto o non valido.
  function num(v) {
    if (v === null || v === undefined) return null;
    const s = String(v).trim().replace(",", ".");
    if (s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  // Numero per i campi di input (con la virgola).
  const perCampo = (n) => (n === null || n === undefined ? "" : String(n).replace(".", ","));

  const isoData = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  function daIso(s) { const [y, m, g] = s.split("-").map(Number); return new Date(y, m - 1, g); }
  function piuGiorni(iso, n) { const d = daIso(iso); d.setDate(d.getDate() + n); return isoData(d); }
  const oggiIso = () => isoData(new Date());
  const giornoIso = (iso) => ((daIso(iso).getDay() + 6) % 7) + 1;      // 1 = lunedì
  const lunediDi = (iso) => piuGiorni(iso, 1 - giornoIso(iso));
  const dataLunga = (iso) => daIso(iso).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  const dataBreve = (iso) => daIso(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short" });

  const GIORNI = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
  const GIORNI_BREVI = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
  const PASTI = [
    ["colazione", "Colazione"], ["spuntino", "Spuntino"], ["pranzo", "Pranzo"],
    ["merenda", "Merenda"], ["pre_allenamento", "Pre-allenamento"], ["cena", "Cena"],
    ["extra", "Extra"], ["uscita", "Uscita"],
  ];
  const PASTI_PIANO = PASTI.slice(0, 6);
  const nomePasto = (p) => (PASTI.find(([k]) => k === p) || [p, p])[1];

  // -------------------------------------------------------------------
  // Calcoli nutrizionali
  // -------------------------------------------------------------------
  const ZERO = () => ({ kcal: 0, proteine_g: 0, carboidrati_g: 0, grassi_g: 0 });

  function valoriAlimento(a, grammi) {
    const f = (Number(grammi) || 0) / 100;
    return {
      kcal: arr1(a.kcal_100g * f),
      proteine_g: arr1(a.proteine_100g * f),
      carboidrati_g: arr1(a.carboidrati_100g * f),
      grassi_g: arr1(a.grassi_100g * f),
    };
  }

  function valoriRicetta(r, porzioni) {
    const p = Number(porzioni) || 0;
    return {
      kcal: arr1(r.kcal_porzione * p),
      proteine_g: arr1(r.proteine_porzione_g * p),
      carboidrati_g: arr1(r.carboidrati_porzione_g * p),
      grassi_g: arr1(r.grassi_porzione_g * p),
    };
  }

  function somma(righe) {
    const t = ZERO();
    righe.forEach((r) => { if (!r) return; t.kcal += Number(r.kcal) || 0; t.proteine_g += Number(r.proteine_g) || 0; t.carboidrati_g += Number(r.carboidrati_g) || 0; t.grassi_g += Number(r.grassi_g) || 0; });
    Object.keys(t).forEach((k) => { t[k] = arr1(t[k]); });
    return t;
  }

  const macroBreve = (v) => `${fmt(v.kcal, 0)} kcal · P ${fmt(v.proteine_g, 0)} · C ${fmt(v.carboidrati_g, 0)} · G ${fmt(v.grassi_g, 0)}`;

  // -------------------------------------------------------------------
  // Dati condivisi (caricati una volta, ricaricati dopo le modifiche)
  // -------------------------------------------------------------------
  const cache = { imp: null, alimenti: [], ricette: [], ingredienti: [], bevande: [], pianoPasti: [], pianoVoci: [] };

  const caricatori = {
    imp: async () => { cache.imp = await dati((c) => c.from("impostazioni").select("*").maybeSingle()); },
    alimenti: async () => { cache.alimenti = await dati((c) => c.from("alimenti").select("*").order("nome")); },
    ricette: async () => {
      const [ricette, macro] = await Promise.all([
        dati((c) => c.from("ricette").select("*").order("nome")),
        dati((c) => c.from("ricette_macro").select("*")),
      ]);
      const perId = Object.fromEntries(macro.map((m) => [m.ricetta_id, m]));
      cache.ricette = ricette.map((r) => ({ ...perId[r.id], ...r }));
    },
    ingredienti: async () => { cache.ingredienti = await dati((c) => c.from("ricetta_ingredienti").select("*").order("ordine")); },
    bevande: async () => { cache.bevande = await dati((c) => c.from("bevande").select("*").order("ordine").order("nome")); },
    piano: async () => {
      const [pasti, voci] = await Promise.all([
        dati((c) => c.from("piano_pasti").select("*")),
        dati((c) => c.from("piano_voci").select("*").order("ordine")),
      ]);
      cache.pianoPasti = pasti;
      cache.pianoVoci = voci;
    },
  };

  async function ricarica(...nomi) {
    const elenco = nomi.length ? nomi : Object.keys(caricatori);
    await Promise.all(elenco.map((n) => caricatori[n]()));
  }

  const alimento = (id) => cache.alimenti.find((a) => a.id === id);
  const ricetta = (id) => cache.ricette.find((r) => r.id === id);
  const pianoPasto = (id) => cache.pianoPasti.find((p) => p.id === id);
  const vociDi = (pianoPastoId) => cache.pianoVoci.filter((v) => v.piano_pasto_id === pianoPastoId);

  // Valori di una voce del piano (alimento in grammi o ricetta in porzioni).
  function valoriVoce(v) {
    if (v.alimento_id) { const a = alimento(v.alimento_id); return a ? valoriAlimento(a, v.grammi) : ZERO(); }
    const r = ricetta(v.ricetta_id); return r ? valoriRicetta(r, v.porzioni) : ZERO();
  }
  function nomeVoce(v) {
    if (v.alimento_id) { const a = alimento(v.alimento_id); return a ? a.nome : "alimento eliminato"; }
    const r = ricetta(v.ricetta_id); return r ? r.nome : "ricetta eliminata";
  }
  const quantitaVoce = (v) => (v.alimento_id ? `${fmt(v.grammi)} g` : `${fmt(v.porzioni, 2)} ${Number(v.porzioni) === 1 ? "porzione" : "porzioni"}`);

  function allenamentoAbituale(isodow) {
    return (cache.imp?.giorni_allenamento || []).includes(isodow);
  }

  // -------------------------------------------------------------------
  // Avvisi brevi in basso
  // -------------------------------------------------------------------
  let timerAvviso;
  function avviso(testo, tipo = "") {
    const el = $("#avviso");
    el.textContent = testo;
    el.className = "avviso visibile " + tipo;
    clearTimeout(timerAvviso);
    timerAvviso = setTimeout(() => { el.className = "avviso"; }, tipo === "errore" ? 5000 : 2200);
  }

  // Esegue un'azione e mostra l'errore, se c'è.
  async function azione(fn, messaggioOk) {
    try {
      const r = await fn();
      if (messaggioOk) avviso(messaggioOk);
      return r;
    } catch (e) {
      console.error(e);
      avviso("Non riuscito: " + e.message, "errore");
      return undefined;
    }
  }

  // -------------------------------------------------------------------
  // Fogli (finestre di modifica dal basso)
  //   foglio({ titolo, html, conferma, elimina, prepara(form, chiudi), salva(dati, form, azione) })
  //   salva: async; se restituisce una stringa, è un errore e il foglio resta aperto.
  //   Risolve con "ok", "elimina", "annulla" o il valore passato a chiudi().
  // -------------------------------------------------------------------
  function foglio({ titolo, html, conferma = "Salva", elimina = false, prepara, salva }) {
    return new Promise((resolve) => {
      const d = $("#foglio");
      d.innerHTML = `
        <form class="foglio-form" novalidate>
          <header class="foglio-testa">
            <h2>${esc(titolo)}</h2>
            <button type="button" class="chiudi" data-chiudi aria-label="Chiudi">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
            </button>
          </header>
          <div class="foglio-corpo">${html}</div>
          <p class="errore foglio-errore" role="alert" hidden></p>
          ${conferma || elimina ? `<footer class="foglio-piede">
            ${elimina ? `<button type="button" class="bottone pericolo" data-elimina>${esc(elimina === true ? "Elimina" : elimina)}</button>` : ""}
            ${conferma ? `<button type="submit" class="bottone primario">${esc(conferma)}</button>` : ""}
          </footer>` : ""}
        </form>`;
      const form = $("form", d);
      const err = $(".foglio-errore", d);
      let finito = false;

      const chiudi = (valore) => {
        if (finito) return;
        finito = true;
        d.close();
        resolve(valore);
      };

      async function esegui(tipo) {
        err.hidden = true;
        if (tipo === "ok" && !form.checkValidity()) { form.reportValidity(); return; }
        if (salva) {
          const bottoni = $$("button", form);
          bottoni.forEach((b) => { b.disabled = true; });
          let esito;
          try {
            esito = await salva(Object.fromEntries(new FormData(form)), form, tipo);
          } catch (e) {
            console.error(e);
            esito = "Non riuscito: " + (e.message || e);
          }
          bottoni.forEach((b) => { b.disabled = false; });
          if (typeof esito === "string") { err.textContent = esito; err.hidden = false; return; }
        }
        chiudi(tipo);
      }

      form.addEventListener("submit", (e) => { e.preventDefault(); esegui("ok"); });
      $("[data-chiudi]", d).addEventListener("click", () => chiudi("annulla"));
      const bElimina = $("[data-elimina]", d);
      if (bElimina) {
        bElimina.addEventListener("click", () => {
          if (bElimina.dataset.conferma) esegui("elimina");
          else { bElimina.dataset.conferma = "1"; bElimina.textContent = "Tocca di nuovo per confermare"; }
        });
      }
      d.oncancel = (e) => { e.preventDefault(); chiudi("annulla"); };
      d.onclick = (e) => { if (e.target === d) chiudi("annulla"); };   // tocco fuori dal foglio

      if (prepara) prepara(form, chiudi);
      d.showModal();
      const primo = $("[autofocus]", form);
      if (primo && window.matchMedia("(hover: hover)").matches) primo.focus();
    });
  }

  // Campi di form riutilizzabili
  function campo(etichetta, nome, valore = "", { tipo = "text", decimale = false, intero = false, richiesto = false, segnaposto = "", attrs = "", aiuto = "" } = {}) {
    const modo = decimale ? 'inputmode="decimal"' : intero ? 'inputmode="numeric" pattern="[0-9]*"' : "";
    return `<label class="campo">
      <span>${esc(etichetta)}</span>
      <input name="${nome}" type="${tipo}" value="${esc(valore)}" ${modo} ${richiesto ? "required" : ""} placeholder="${esc(segnaposto)}" ${attrs}>
      ${aiuto ? `<small class="aiuto">${aiuto}</small>` : ""}
    </label>`;
  }
  function areaTesto(etichetta, nome, valore = "", righe = 4) {
    return `<label class="campo"><span>${esc(etichetta)}</span><textarea name="${nome}" rows="${righe}">${esc(valore)}</textarea></label>`;
  }
  function spunta(etichetta, nome, attiva) {
    return `<label class="spunta"><input type="checkbox" name="${nome}" ${attiva ? "checked" : ""}><span>${esc(etichetta)}</span></label>`;
  }
  function sceltaPasto(nome, valore, elenco = PASTI) {
    return `<label class="campo"><span>Pasto</span><select name="${nome}">
      ${elenco.map(([k, n]) => `<option value="${k}" ${k === valore ? "selected" : ""}>${n}</option>`).join("")}
    </select></label>`;
  }

  // -------------------------------------------------------------------
  // Scelta di un alimento o di una ricetta, poi della quantità
  //   scegliCibo({ titolo, ricette: true }) → { tipo, item, grammi | porzioni } | null
  // -------------------------------------------------------------------
  function scegliCibo({ titolo = "Aggiungi", ricette = true, conBarre = true } = {}) {
    return new Promise((resolve) => {
      let scelto = null;
      const html = `
        <label class="campo cerca"><span>Cerca</span>
          <input name="cerca" type="search" placeholder="Nome dell'alimento${ricette ? " o della ricetta" : ""}" autocomplete="off" autofocus>
        </label>
        <div class="azioni-riga">
          ${conBarre ? `<button type="button" class="bottone piccolo" data-barre>Codice a barre</button>` : ""}
          <button type="button" class="bottone piccolo" data-nuovo>Nuovo alimento</button>
        </div>
        <ul class="scelte" data-elenco></ul>`;

      foglio({
        titolo, html, conferma: false,
        prepara(form, chiudi) {
          const elenco = $("[data-elenco]", form);
          const disegna = () => {
            const q = form.cerca.value.trim().toLowerCase();
            const trova = (s) => !q || s.toLowerCase().includes(q);
            const alim = cache.alimenti.filter((a) => !a.archiviato && trova(`${a.nome} ${a.marca || ""}`))
              .sort((a, b) => (b.preferito - a.preferito) || a.nome.localeCompare(b.nome, "it"));
            const ric = ricette ? cache.ricette.filter((r) => !r.archiviata && trova(r.nome)) : [];
            const voci = [
              ...ric.map((r) => `<li><button type="button" data-ricetta="${r.id}">
                  <span class="scelta-nome">${esc(r.nome)} <em class="etichetta">ricetta</em></span>
                  <span class="scelta-info">${fmt(r.kcal_porzione, 0)} kcal a porzione</span></button></li>`),
              ...alim.map((a) => `<li><button type="button" data-alimento="${a.id}">
                  <span class="scelta-nome">${a.preferito ? "★ " : ""}${esc(a.nome)}${a.marca ? ` <small>${esc(a.marca)}</small>` : ""}</span>
                  <span class="scelta-info">${fmt(a.kcal_100g, 0)} kcal / 100 g</span></button></li>`),
            ];
            elenco.innerHTML = voci.length ? voci.join("") :
              `<li class="segnaposto">${cache.alimenti.length ? "Nessun risultato." : "Non hai ancora alimenti salvati: creane uno con «Nuovo alimento» o con il codice a barre."}</li>`;
          };
          form.cerca.addEventListener("input", disegna);
          elenco.addEventListener("click", (e) => {
            const b = e.target.closest("button");
            if (!b) return;
            scelto = b.dataset.ricetta ? { tipo: "ricetta", item: ricetta(b.dataset.ricetta) } : { tipo: "alimento", item: alimento(b.dataset.alimento) };
            chiudi("scelto");
          });
          $("[data-nuovo]", form).addEventListener("click", () => { scelto = { tipo: "nuovo", nome: form.cerca.value.trim() }; chiudi("scelto"); });
          const barre = $("[data-barre]", form);
          if (barre) barre.addEventListener("click", () => { scelto = { tipo: "barre" }; chiudi("scelto"); });
          disegna();
        },
      }).then(async (esito) => {
        if (esito !== "scelto" || !scelto) return resolve(null);
        if (scelto.tipo === "nuovo") {
          const a = await D.modificaAlimento(null, { nome: scelto.nome });
          if (!a) return resolve(null);
          scelto = { tipo: "alimento", item: a };
        }
        if (scelto.tipo === "barre") {
          const a = await D.alimentoDaCodice();
          if (!a) return resolve(null);
          scelto = { tipo: "alimento", item: a };
        }
        const q = await chiediQuantita(scelto.tipo, scelto.item);
        resolve(q ? { ...scelto, ...q } : null);
      });
    });
  }

  // Quantità di un alimento (grammi) o di una ricetta (porzioni), con anteprima.
  async function chiediQuantita(tipo, item, attuale) {
    const isAlim = tipo === "alimento";
    const iniziale = attuale ?? (isAlim ? (item.porzione_g || 100) : 1);
    let risultato = null;
    const html = `
      <p class="sottotitolo-foglio">${esc(item.nome)}</p>
      ${campo(isAlim ? "Grammi" : "Porzioni", "q", perCampo(iniziale), { decimale: true, richiesto: true, attrs: "autofocus" })}
      ${isAlim && item.porzione_g ? `<div class="azioni-riga">
        ${[0.5, 1, 2].map((m) => `<button type="button" class="chip" data-g="${item.porzione_g * m}">${m === 1 ? "" : (m === 0.5 ? "½ " : "2 × ")}${esc(item.porzione_nome || "porzione")} · ${fmt(item.porzione_g * m)} g</button>`).join("")}
      </div>` : ""}
      ${!isAlim ? `<div class="azioni-riga">${[0.5, 1, 1.5, 2].map((p) => `<button type="button" class="chip" data-g="${p}">${fmt(p, 2)}</button>`).join("")}</div>` : ""}
      <p class="anteprima" data-anteprima></p>`;
    const esito = await foglio({
      titolo: isAlim ? "Quanti grammi?" : "Quante porzioni?", html, conferma: "Conferma",
      prepara(form) {
        const ant = $("[data-anteprima]", form);
        const aggiorna = () => {
          const q = num(form.q.value);
          ant.textContent = q && q > 0 ? macroBreve(isAlim ? valoriAlimento(item, q) : valoriRicetta(item, q)) : "";
        };
        form.q.addEventListener("input", aggiorna);
        $$("[data-g]", form).forEach((b) => b.addEventListener("click", () => { form.q.value = perCampo(Number(b.dataset.g)); aggiorna(); }));
        aggiorna();
      },
      salva(d) {
        const q = num(d.q);
        if (!q || q <= 0) return "Scrivi una quantità maggiore di zero.";
        risultato = isAlim ? { grammi: q } : { porzioni: q };
        return undefined;
      },
    });
    return esito === "ok" ? risultato : null;
  }

  // -------------------------------------------------------------------
  // Viste e navigazione
  // -------------------------------------------------------------------
  const sezioni = {};
  function sezione(nome, modulo) { sezioni[nome] = modulo; }

  function nascondiAvvio() { $("#avvio").hidden = true; }

  function mostraLogin() {
    $("#vista-app").hidden = true;
    $("#vista-login").hidden = false;
    nascondiAvvio();
  }

  let pronta = null;           // promessa del primo caricamento dei dati
  let attuale = null;
  function mostraApp(session) {
    $("#vista-login").hidden = true;
    $("#vista-app").hidden = false;
    nascondiAvvio();
    D.utente = session.user;
    $("#account-email").textContent = session.user.email;
    aggiornaInfoSessione(session);
    if (!pronta) {
      pronta = ricarica().catch((e) => {
        pronta = null;
        avviso("Non riesco a leggere i dati: " + erroreLeggibile(e).message, "errore");
        throw e;
      });
    }
    attuale = null;
    vaiA(sezioneDaHash());
  }

  function aggiornaInfoSessione(session) {
    if (!session) return;
    const scade = new Date(session.expires_at * 1000);
    const ora = scade.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    $("#account-sessione").textContent = `attiva · rinnovo automatico (prossimo ${ora})`;
  }

  function sezioneDaHash() {
    const h = location.hash.replace("#", "");
    return SEZIONI.includes(h) ? h : "oggi";
  }

  async function vaiA(nome) {
    const cambiata = attuale !== nome;
    attuale = nome;
    $$(".sezione").forEach((s) => { s.hidden = s.dataset.sezione !== nome; });
    $$(".barra a").forEach((a) => {
      if (a.dataset.vai === nome) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    if (cambiata) window.scrollTo(0, 0);
    if (!pronta || $("#vista-app").hidden) return;
    try { await pronta; } catch { return; }
    if (sezioni[nome]?.carica) azione(() => sezioni[nome].carica());
  }
  window.addEventListener("hashchange", () => vaiA(sezioneDaHash()));

  // Ricarica la sezione visibile (dopo una modifica).
  function aggiornaVista() {
    if (attuale && sezioni[attuale]?.carica) return azione(() => sezioni[attuale].carica());
    return undefined;
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
    pronta = null;
  });

  sb.auth.onAuthStateChange((evento, session) => {
    // la callback non deve essere async (consiglio di supabase-js): rimandiamo il lavoro
    setTimeout(() => {
      if (session) {
        if (evento === "TOKEN_REFRESHED") aggiornaInfoSessione(session);
        // l'avvio lo gestisce DOMContentLoaded; qui solo il login appena fatto
        else if (evento !== "INITIAL_SESSION" && $("#vista-app").hidden) mostraApp(session);
      } else {
        mostraLogin();
      }
    }, 0);
  });

  // -------------------------------------------------------------------
  // Esportazione
  // -------------------------------------------------------------------
  const D = window.Dieta = {
    sb, db, dati, $, $$, esc, fmt, arr1, num, perCampo,
    isoData, daIso, piuGiorni, oggiIso, giornoIso, lunediDi, dataLunga, dataBreve,
    GIORNI, GIORNI_BREVI, PASTI, PASTI_PIANO, nomePasto,
    ZERO, valoriAlimento, valoriRicetta, somma, macroBreve,
    cache, ricarica, alimento, ricetta, pianoPasto, vociDi, valoriVoce, nomeVoce, quantitaVoce, allenamentoAbituale,
    avviso, azione, foglio, campo, areaTesto, spunta, sceltaPasto, scegliCibo, chiediQuantita,
    sezione, aggiornaVista, utente: null,
  };

  // Avvio, dopo che tutte le sezioni si sono registrate
  document.addEventListener("DOMContentLoaded", () => {
    sessioneFresca().then((s) => (s ? mostraApp(s) : mostraLogin()));
  });
})();
