/* =====================================================================
   Dieta — Oggi
   Il diario di un giorno: pasti del piano (da segnare come fatti o da
   scambiare), aggiunte, extra, drink delle uscite, acqua, passi,
   allenamento e nota.
   ===================================================================== */
(function () {
  "use strict";
  const D = window.Dieta;
  const { $, $$, esc, fmt } = D;

  let giorno = D.oggiIso();
  let stato = { diario: [], giornata: null, scambi: [], acqua: 0, passi: null };

  // -------------------------------------------------------------------
  // Caricamento
  // -------------------------------------------------------------------
  async function carica() {
    const g = giorno;
    const [diario, giornata, scambi, acqua, passi] = await Promise.all([
      D.dati((c) => c.from("diario").select("*").eq("data", g).order("created_at")),
      D.dati((c) => c.from("giornate").select("*").eq("data", g).maybeSingle()),
      D.dati((c) => c.from("scambi_pasto").select("*").eq("data", g)),
      D.dati((c) => c.from("acqua").select("bicchieri").eq("data", g).maybeSingle()),
      D.dati((c) => c.from("passi").select("passi").eq("data", g).maybeSingle()),
    ]);
    if (g !== giorno) return;            // nel frattempo è stato cambiato giorno
    stato = { diario, giornata, scambi, acqua: acqua ? acqua.bicchieri : 0, passi: passi ? passi.passi : null };
    disegna();
  }

  const dow = () => D.giornoIso(giorno);
  function allenamento() {
    const g = stato.giornata;
    return g && g.allenamento !== null ? g.allenamento : D.allenamentoAbituale(dow());
  }

  // Il pasto del piano per questo giorno (tenendo conto degli scambi).
  function pianoPer(p) {
    const scambio = stato.scambi.find((s) => s.pasto === p);
    if (scambio) return { piano: D.pianoPasto(scambio.piano_pasto_id) || null, scambio };
    const piano = D.cache.pianoPasti.find((x) => x.giorno_settimana === dow() && x.pasto === p);
    if (piano && piano.solo_allenamento && !allenamento()) return { piano: null, riposo: piano };
    return { piano: piano || null };
  }

  // -------------------------------------------------------------------
  // Disegno
  // -------------------------------------------------------------------
  function titoloGiorno() {
    const oggi = D.oggiIso();
    if (giorno === oggi) return "Oggi";
    if (giorno === D.piuGiorni(oggi, -1)) return "Ieri";
    if (giorno === D.piuGiorni(oggi, 1)) return "Domani";
    return D.GIORNI[dow() - 1];
  }

  function barra(nome, consumato, obiettivo, unita, classe = "") {
    const perc = obiettivo > 0 ? Math.min(100, (consumato / obiettivo) * 100) : 0;
    const oltre = obiettivo > 0 && consumato > obiettivo * 1.05;
    return `
      <div class="barra-macro ${classe} ${oltre ? "oltre" : ""}">
        <div class="riga">
          <span class="nome">${nome}</span>
          <span class="valori"><b>${fmt(consumato, 0)}</b> / ${fmt(obiettivo, 0)} ${unita}</span>
        </div>
        <div class="binario"><div class="riempimento" style="width:${perc}%"></div></div>
      </div>`;
  }

  function rigaDiario(r) {
    const q = r.grammi ? `${fmt(r.grammi)} g` : r.porzioni ? `${fmt(r.porzioni, 2)} porz.` : "";
    return `<li><button type="button" class="voce" data-riga="${r.id}">
      <span class="voce-nome">${esc(r.descrizione)}${q ? ` <small>${q}</small>` : ""}</span>
      <span class="voce-kcal">${fmt(r.kcal, 0)}</span>
    </button></li>`;
  }

  function vocePrevista(v) {
    return `<li class="voce prevista">
      <span class="voce-nome">${esc(D.nomeVoce(v))} <small>${D.quantitaVoce(v)}</small></span>
      <span class="voce-kcal">${fmt(D.valoriVoce(v).kcal, 0)}</span>
    </li>`;
  }

  function cardPasto(p, etichetta) {
    const righe = stato.diario.filter((r) => r.pasto === p);
    const { piano, scambio } = pianoPer(p);
    if (!piano && !righe.length) return "";
    const fatto = righe.some((r) => r.dal_piano);
    const voci = piano && !fatto ? D.vociDi(piano.id) : [];
    const mangiato = D.somma(righe);
    const previsto = D.somma(voci.map(D.valoriVoce));

    let stato_ = "";
    if (fatto) stato_ = `<span class="pasto-stato fatto">✓ ${fmt(mangiato.kcal, 0)} kcal</span>`;
    else if (righe.length) stato_ = `<span class="pasto-stato">${fmt(mangiato.kcal, 0)} kcal${voci.length ? ` + ${fmt(previsto.kcal, 0)} previste` : ""}</span>`;
    else stato_ = `<span class="pasto-stato">${fmt(previsto.kcal, 0)} kcal previste</span>`;

    const sotto = piano && (piano.nome || scambio)
      ? `<p class="pasto-sotto">${esc(piano.nome || "")}${scambio ? `${piano.nome ? " · " : ""}<em>scambiato con ${D.GIORNI[piano.giorno_settimana - 1].toLowerCase()}${piano.pasto !== p ? " " + D.nomePasto(piano.pasto).toLowerCase() : ""}</em>` : ""}</p>`
      : "";

    return `<li class="pasto ${fatto ? "e-fatto" : ""}">
      <div class="pasto-testa"><span class="pasto-nome">${etichetta}</span>${stato_}</div>
      ${sotto}
      ${voci.length || righe.length ? `<ul class="voci">${voci.map(vocePrevista).join("")}${righe.map(rigaDiario).join("")}</ul>` : ""}
      ${piano && !fatto && !voci.length ? `<p class="segnaposto piccolo">Questo pasto del piano è vuoto: riempilo in Cucina → Piano.</p>` : ""}
      ${piano && piano.note && !fatto ? `<p class="nota-pasto">${esc(piano.note)}</p>` : ""}
      <div class="pasto-azioni">
        ${piano && !fatto && voci.length ? `<button type="button" class="bottone piccolo primario" data-azione="fatto" data-pasto="${p}">✓ Fatto</button>` : ""}
        ${fatto ? `<button type="button" class="bottone piccolo" data-azione="annulla-fatto" data-pasto="${p}">Annulla “fatto”</button>` : ""}
        ${!fatto && D.cache.pianoPasti.length ? `<button type="button" class="bottone piccolo" data-azione="scambia" data-pasto="${p}">Scambia</button>` : ""}
        <button type="button" class="bottone piccolo" data-azione="aggiungi" data-pasto="${p}">+ Aggiungi</button>
      </div>
    </li>`;
  }

  function cardExtra() {
    const righe = stato.diario.filter((r) => r.pasto === "extra");
    const tot = D.somma(righe);
    return `<li class="pasto">
      <div class="pasto-testa"><span class="pasto-nome">Extra</span><span class="pasto-stato">${righe.length ? fmt(tot.kcal, 0) + " kcal" : "fuori piano"}</span></div>
      ${righe.length ? `<ul class="voci">${righe.map(rigaDiario).join("")}</ul>` : ""}
      <div class="pasto-azioni">
        <button type="button" class="bottone piccolo" data-azione="aggiungi" data-pasto="extra">+ Alimento</button>
        <button type="button" class="bottone piccolo" data-azione="barre" data-pasto="extra">Codice a barre</button>
        <button type="button" class="bottone piccolo" data-azione="libero" data-pasto="extra">Libero</button>
      </div>
    </li>`;
  }

  function cardUscita() {
    const righe = stato.diario.filter((r) => r.pasto === "uscita");
    const tot = D.somma(righe);
    const drink = D.cache.bevande.filter((b) => !b.archiviata);
    return `<li class="pasto">
      <div class="pasto-testa"><span class="pasto-nome">Uscita</span><span class="pasto-stato">${righe.length ? fmt(tot.kcal, 0) + " kcal" : "drink e cene fuori"}</span></div>
      ${righe.length ? `<ul class="voci">${righe.map(rigaDiario).join("")}</ul>` : ""}
      <div class="chips" aria-label="Aggiungi un drink">
        ${drink.map((b) => `<button type="button" class="chip" data-drink="${b.id}">${esc(b.nome)} <small>${fmt(b.kcal, 0)}</small></button>`).join("")}
      </div>
      <div class="pasto-azioni">
        <button type="button" class="bottone piccolo" data-azione="libero" data-pasto="uscita">+ Libero</button>
        <button type="button" class="bottone piccolo" data-azione="aggiungi" data-pasto="uscita">+ Alimento</button>
      </div>
    </li>`;
  }

  function disegna() {
    const imp = D.cache.imp;
    if (!imp) return;
    const oggi = D.oggiIso();
    const allena = allenamento();

    $("#oggi-data").textContent = D.dataLunga(giorno);
    $("#oggi-titolo").textContent = titoloGiorno();
    $("#oggi-chip").innerHTML = `
      <button type="button" class="chip ${allena ? "attivo" : ""}" data-azione="allenamento" aria-pressed="${allena}">
        ${allena ? "Giorno di allenamento" : "Giorno di riposo"}
      </button>
      ${giorno !== oggi ? `<button type="button" class="chip" data-azione="vai-oggi">Torna a oggi</button>` : ""}`;

    const fatti = stato.diario.filter((r) => r.fatto);
    const tot = D.somma(fatti);
    const rimaste = imp.kcal_obiettivo - tot.kcal;
    $("#kcal-rimanenti").textContent = fmt(Math.abs(rimaste), 0);
    $("#kcal-etichetta").innerHTML = rimaste >= 0
      ? `kcal rimaste<br>su <b>${fmt(imp.kcal_obiettivo, 0)}</b>`
      : `kcal <b>oltre</b><br>l'obiettivo di <b>${fmt(imp.kcal_obiettivo, 0)}</b>`;
    $("#barre-macro").innerHTML =
      barra("Calorie", tot.kcal, imp.kcal_obiettivo, "kcal", "kcal-riga") +
      barra("Proteine", tot.proteine_g, imp.proteine_obiettivo_g, "g") +
      barra("Carboidrati", tot.carboidrati_g, imp.carboidrati_obiettivo_g, "g") +
      barra("Grassi", tot.grassi_g, imp.grassi_obiettivo_g, "g");

    const pasti = D.PASTI_PIANO.map(([p, n]) => cardPasto(p, n)).join("");
    $("#oggi-pasti").innerHTML = (pasti || `<li class="vuoto piccolo"><p class="segnaposto">Nessun pasto nel piano per ${D.GIORNI[dow() - 1].toLowerCase()}. Puoi crearlo in <a href="#cucina">Cucina → Piano</a>, oppure aggiungere qui quello che mangi.</p></li>`)
      + cardExtra() + cardUscita();

    $("#acqua-bicchieri").textContent = stato.acqua;
    $("#acqua-obiettivo").textContent = imp.acqua_obiettivo_bicchieri;
    $("#acqua-ml").textContent = `${fmt((stato.acqua * imp.bicchiere_ml) / 1000, 2)} litri`;
    $("#passi-numero").textContent = stato.passi === null ? "—" : fmt(stato.passi, 0);
    $("#passi-obiettivo").textContent = imp.passi_obiettivo ? `obiettivo ${fmt(imp.passi_obiettivo, 0)}` : "tocca per scrivere";
    const nota = stato.giornata && stato.giornata.note;
    $("#oggi-nota").innerHTML = nota ? esc(nota).replace(/\n/g, "<br>") : `<span class="segnaposto">Tocca per scrivere una nota sulla giornata.</span>`;
  }

  // -------------------------------------------------------------------
  // Azioni
  // -------------------------------------------------------------------
  async function inserisci(righe) {
    await D.dati((c) => c.from("diario").insert(righe.map((r) => ({ data: giorno, ...r }))));
    await carica();
  }

  function rigaDaScelta(pasto, s) {
    if (s.tipo === "alimento") {
      return { pasto, alimento_id: s.item.id, descrizione: s.item.nome, grammi: s.grammi, ...D.valoriAlimento(s.item, s.grammi) };
    }
    return { pasto, ricetta_id: s.item.id, descrizione: s.item.nome, porzioni: s.porzioni, ...D.valoriRicetta(s.item, s.porzioni) };
  }

  async function segnaFatto(p) {
    const { piano } = pianoPer(p);
    if (!piano) return;
    const righe = D.vociDi(piano.id).map((v) => {
      const base = { pasto: p, piano_pasto_id: piano.id, dal_piano: true, descrizione: D.nomeVoce(v), ...D.valoriVoce(v) };
      return v.alimento_id ? { ...base, alimento_id: v.alimento_id, grammi: v.grammi } : { ...base, ricetta_id: v.ricetta_id, porzioni: v.porzioni };
    });
    await inserisci(righe);
    D.avviso(`${D.nomePasto(p)}: fatto`);
  }

  async function annullaFatto(p) {
    await D.dati((c) => c.from("diario").delete().eq("data", giorno).eq("pasto", p).eq("dal_piano", true));
    await carica();
  }

  async function scambia(p) {
    const { scambio } = pianoPer(p);
    const opzioni = D.cache.pianoPasti
      .filter((x) => !(x.giorno_settimana === dow() && x.pasto === p) && D.vociDi(x.id).length)
      .sort((a, b) => ((b.pasto === p) - (a.pasto === p)) || (a.giorno_settimana - b.giorno_settimana)
        || D.PASTI.findIndex(([k]) => k === a.pasto) - D.PASTI.findIndex(([k]) => k === b.pasto));
    let scelto = null;
    const html = `
      <p class="sottotitolo-foglio">Al posto di ${esc(D.nomePasto(p).toLowerCase())} di ${esc(D.dataLunga(giorno))} mangio:</p>
      ${scambio ? `<button type="button" class="bottone secondario stretto" data-scelta="ripristina">Torna al piano del giorno</button>` : ""}
      <ul class="scelte">
        ${opzioni.length ? opzioni.map((x) => `<li><button type="button" data-scelta="${x.id}">
          <span class="scelta-nome">${esc(D.GIORNI[x.giorno_settimana - 1])} · ${esc(D.nomePasto(x.pasto))}${x.nome ? ` <small>${esc(x.nome)}</small>` : ""}</span>
          <span class="scelta-info">${fmt(D.somma(D.vociDi(x.id).map(D.valoriVoce)).kcal, 0)} kcal</span>
        </button></li>`).join("") : `<li class="segnaposto">Non ci sono altri pasti nel piano.</li>`}
      </ul>`;
    const esito = await D.foglio({
      titolo: "Scambia " + D.nomePasto(p).toLowerCase(), html, conferma: false,
      prepara(form, chiudi) {
        form.addEventListener("click", (e) => {
          const b = e.target.closest("[data-scelta]");
          if (b) { scelto = b.dataset.scelta; chiudi("scelto"); }
        });
      },
    });
    if (esito !== "scelto") return;
    if (scelto === "ripristina") {
      await D.dati((c) => c.from("scambi_pasto").delete().eq("data", giorno).eq("pasto", p));
    } else {
      await D.dati((c) => c.from("scambi_pasto").upsert({ data: giorno, pasto: p, piano_pasto_id: scelto }, { onConflict: "user_id,data,pasto" }));
    }
    await carica();
  }

  async function aggiungi(p) {
    const s = await D.scegliCibo({ titolo: "Aggiungi a " + D.nomePasto(p).toLowerCase() });
    if (!s) return;
    await inserisci([rigaDaScelta(p, s)]);
    D.avviso("Aggiunto: " + s.item.nome);
  }

  async function daCodice(p) {
    const a = await D.alimentoDaCodice();
    if (!a) return;
    const q = await D.chiediQuantita("alimento", a);
    if (!q) return;
    await inserisci([rigaDaScelta(p, { tipo: "alimento", item: a, ...q })]);
    D.avviso("Aggiunto: " + a.nome);
  }

  function campiMacro(v = {}) {
    return `<div class="griglia-4">
      ${D.campo("kcal", "kcal", D.perCampo(v.kcal ?? ""), { decimale: true, richiesto: true })}
      ${D.campo("Proteine g", "proteine_g", D.perCampo(v.proteine_g ?? 0), { decimale: true })}
      ${D.campo("Carboidrati g", "carboidrati_g", D.perCampo(v.carboidrati_g ?? 0), { decimale: true })}
      ${D.campo("Grassi g", "grassi_g", D.perCampo(v.grassi_g ?? 0), { decimale: true })}
    </div>`;
  }
  function leggiMacro(d) {
    const v = { kcal: D.num(d.kcal), proteine_g: D.num(d.proteine_g) ?? 0, carboidrati_g: D.num(d.carboidrati_g) ?? 0, grassi_g: D.num(d.grassi_g) ?? 0 };
    if (v.kcal === null) return "Scrivi le calorie.";
    if (Object.values(v).some((n) => n < 0)) return "I valori non possono essere negativi.";
    return v;
  }

  async function libero(p) {
    await D.foglio({
      titolo: p === "uscita" ? "Uscita: aggiungi" : "Aggiungi a mano",
      html: D.campo("Cosa", "descrizione", "", { richiesto: true, segnaposto: p === "uscita" ? "es. pizza margherita" : "es. biscotto al bar", attrs: "autofocus" })
        + D.sceltaPasto("pasto", p) + campiMacro(),
      async salva(d) {
        const v = leggiMacro(d);
        if (typeof v === "string") return v;
        if (!d.descrizione.trim()) return "Scrivi cosa hai mangiato.";
        await inserisci([{ pasto: d.pasto, descrizione: d.descrizione.trim(), ...v }]);
        return undefined;
      },
    });
  }

  async function drink(id) {
    const b = D.cache.bevande.find((x) => x.id === id);
    if (!b) return;
    await inserisci([{ pasto: "uscita", bevanda_id: b.id, descrizione: b.nome, kcal: b.kcal, proteine_g: b.proteine_g, carboidrati_g: b.carboidrati_g, grassi_g: b.grassi_g }]);
    D.avviso(`Aggiunto: ${b.nome} (${fmt(b.kcal, 0)} kcal)`);
  }

  async function modificaRiga(id) {
    const r = stato.diario.find((x) => x.id === id);
    if (!r) return;
    const campoQ = r.grammi ? ["Grammi", "grammi", r.grammi] : r.porzioni ? ["Porzioni", "porzioni", r.porzioni] : null;
    await D.foglio({
      titolo: "Modifica", elimina: true,
      html: D.campo("Cosa", "descrizione", r.descrizione, { richiesto: true })
        + `<div class="griglia-2">${campoQ ? D.campo(campoQ[0], campoQ[1], D.perCampo(campoQ[2]), { decimale: true, richiesto: true, aiuto: "le calorie si ricalcolano" }) : ""}${D.sceltaPasto("pasto", r.pasto)}</div>`
        + campiMacro(r)
        + (r.dal_piano ? `<p class="segnaposto piccolo">Viene dal piano: qui cambi solo questo giorno, il piano resta uguale.</p>` : ""),
      prepara(form) {
        if (!campoQ) return;
        const input = form[campoQ[1]];
        input.addEventListener("input", () => {
          const q = D.num(input.value);
          if (!q || q <= 0) return;
          const f = q / campoQ[2];
          ["kcal", "proteine_g", "carboidrati_g", "grassi_g"].forEach((k) => { form[k].value = D.perCampo(D.arr1(r[k] * f)); });
        });
      },
      async salva(d, form, tipo) {
        if (tipo === "elimina") {
          await D.dati((c) => c.from("diario").delete().eq("id", id));
          await carica();
          return undefined;
        }
        const v = leggiMacro(d);
        if (typeof v === "string") return v;
        const agg = { descrizione: d.descrizione.trim() || r.descrizione, pasto: d.pasto, ...v };
        if (campoQ) {
          const q = D.num(d[campoQ[1]]);
          if (!q || q <= 0) return "La quantità deve essere maggiore di zero.";
          agg[campoQ[1]] = q;
        }
        await D.dati((c) => c.from("diario").update(agg).eq("id", id));
        await carica();
        return undefined;
      },
    });
  }

  async function aggiungiGenerico() {
    let pasto = null;
    const html = `<div class="scelte-griglia">${D.PASTI.map(([k, n]) => `<button type="button" class="bottone secondario stretto" data-p="${k}">${n}</button>`).join("")}</div>`;
    const esito = await D.foglio({
      titolo: "A quale pasto?", html, conferma: false,
      prepara(form, chiudi) { form.addEventListener("click", (e) => { const b = e.target.closest("[data-p]"); if (b) { pasto = b.dataset.p; chiudi("scelto"); } }); },
    });
    if (esito === "scelto") await aggiungi(pasto);
  }

  async function acqua(delta) {
    const nuovo = Math.max(0, Math.min(60, stato.acqua + delta));
    if (nuovo === stato.acqua) return;
    stato.acqua = nuovo;
    disegna();
    await D.dati((c) => c.from("acqua").upsert({ data: giorno, bicchieri: nuovo }, { onConflict: "user_id,data" }));
  }

  async function passi() {
    await D.foglio({
      titolo: "Passi di " + titoloGiorno().toLowerCase(),
      html: D.campo("Passi", "passi", stato.passi ?? "", { intero: true, attrs: "autofocus", aiuto: "Lascia vuoto per cancellare." }),
      async salva(d) {
        const n = D.num(d.passi);
        if (n === null) await D.dati((c) => c.from("passi").delete().eq("data", giorno));
        else if (n < 0 || n > 200000 || !Number.isInteger(n)) return "Scrivi un numero intero tra 0 e 200.000.";
        else await D.dati((c) => c.from("passi").upsert({ data: giorno, passi: n }, { onConflict: "user_id,data" }));
        await carica();
        return undefined;
      },
    });
  }

  async function giornata(campi) {
    await D.dati((c) => c.from("giornate").upsert({ data: giorno, ...campi }, { onConflict: "user_id,data" }));
    await carica();
  }

  async function nota() {
    await D.foglio({
      titolo: "Nota del giorno",
      html: D.areaTesto("Nota", "note", stato.giornata?.note || "", 5),
      async salva(d) { await giornata({ note: d.note.trim() || null }); return undefined; },
    });
  }

  function cambiaGiorno(n) {
    giorno = n === 0 ? D.oggiIso() : D.piuGiorni(giorno, n);
    D.azione(carica);
  }

  // -------------------------------------------------------------------
  // Eventi
  // -------------------------------------------------------------------
  const sez = $("#sezione-oggi");
  sez.addEventListener("click", (e) => {
    const t = e.target.closest("[data-azione],[data-riga],[data-drink],[data-giorno],[data-acqua]");
    if (!t) return;
    if (t.dataset.giorno) return cambiaGiorno(Number(t.dataset.giorno));
    if (t.dataset.acqua) return D.azione(() => acqua(Number(t.dataset.acqua)));
    if (t.dataset.riga) return D.azione(() => modificaRiga(t.dataset.riga));
    if (t.dataset.drink) return D.azione(() => drink(t.dataset.drink));
    const p = t.dataset.pasto;
    switch (t.dataset.azione) {
      case "fatto": return D.azione(() => segnaFatto(p));
      case "annulla-fatto": return D.azione(() => annullaFatto(p));
      case "scambia": return D.azione(() => scambia(p));
      case "aggiungi": return D.azione(() => aggiungi(p));
      case "barre": return D.azione(() => daCodice(p));
      case "libero": return D.azione(() => libero(p));
      case "aggiungi-generico": return D.azione(aggiungiGenerico);
      case "passi": return D.azione(passi);
      case "nota": return D.azione(nota);
      case "allenamento": return D.azione(() => giornata({ allenamento: !allenamento() }));
      case "vai-oggi": return cambiaGiorno(0);
      default: return undefined;
    }
  });

  // Se l'app resta aperta oltre la mezzanotte, torna sul nuovo "oggi".
  let ultimoOggi = D.oggiIso();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    const ora = D.oggiIso();
    if (ora !== ultimoOggi) {
      if (giorno === ultimoOggi) giorno = ora;
      ultimoOggi = ora;
      if (!sez.hidden && D.cache.imp) D.azione(carica);
    }
  });

  D.sezione("oggi", { carica });
})();
