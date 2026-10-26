/* =====================================================================
   Dieta — Cucina
   Quattro schede: Piano settimanale, Ricette, Alimenti, Drink.
   Qui ci sono anche modificaAlimento() e alimentoDaCodice(), usati
   pure da Oggi (codice a barre, Open Food Facts, fotocamera).
   ===================================================================== */
(function () {
  "use strict";
  const D = window.Dieta;
  const { $, $$, esc, fmt } = D;

  const SCHEDE = [["piano", "Piano"], ["ricette", "Ricette"], ["alimenti", "Alimenti"], ["drink", "Drink"]];
  let scheda = leggi("dieta-scheda-cucina", "piano");
  let giornoPiano = D.giornoIso(D.oggiIso());
  let ricettaAperta = null;
  let cerca = "";
  let archiviati = false;

  function leggi(k, def) { try { return localStorage.getItem(k) || def; } catch { return def; } }
  function scrivi(k, v) { try { localStorage.setItem(k, v); } catch { /* niente */ } }

  async function carica() { disegna(); }

  function disegna() {
    $("#cucina-schede").innerHTML = SCHEDE.map(([k, n]) =>
      `<button type="button" role="tab" data-scheda="${k}" aria-selected="${k === scheda}">${n}</button>`).join("");
    const corpo = $("#cucina-corpo");
    if (scheda === "piano") corpo.innerHTML = vistaPiano();
    else if (scheda === "ricette") corpo.innerHTML = ricettaAperta ? vistaRicetta() : vistaRicette();
    else if (scheda === "alimenti") { corpo.innerHTML = vistaAlimenti(); disegnaAlimenti(); }
    else corpo.innerHTML = vistaDrink();
  }

  const totaleRiga = (v) => `<p class="totale-riga"><b>${fmt(v.kcal, 0)} kcal</b> · P ${fmt(v.proteine_g, 0)} g · C ${fmt(v.carboidrati_g, 0)} g · G ${fmt(v.grassi_g, 0)} g</p>`;

  // ===================================================================
  // PIANO SETTIMANALE
  // ===================================================================
  const pastoDi = (g, p) => D.cache.pianoPasti.find((x) => x.giorno_settimana === g && x.pasto === p);

  function vistaPiano() {
    const imp = D.cache.imp;
    const pasti = D.PASTI_PIANO.map(([p]) => pastoDi(giornoPiano, p)).filter(Boolean);
    const valori = (x) => D.somma(D.vociDi(x.id).map(D.valoriVoce));
    const tutti = D.somma(pasti.map(valori));
    const soloAll = D.somma(pasti.filter((x) => x.solo_allenamento).map(valori));
    const diff = imp ? tutti.kcal - imp.kcal_obiettivo : 0;

    return `
      <div class="chips giorni" role="group" aria-label="Giorno della settimana">
        ${D.GIORNI_BREVI.map((g, i) => `<button type="button" class="chip ${i + 1 === giornoPiano ? "attivo" : ""}" data-giorno-piano="${i + 1}"
          aria-pressed="${i + 1 === giornoPiano}">${g}${D.allenamentoAbituale(i + 1) ? " ·" : ""}</button>`).join("")}
      </div>
      <div class="riquadro">
        <p class="riquadro-titolo">${D.GIORNI[giornoPiano - 1]}${D.allenamentoAbituale(giornoPiano) ? " · allenamento" : ""}</p>
        ${totaleRiga(tutti)}
        ${imp ? `<p class="segnaposto piccolo">${diff === 0 ? "In linea con l'obiettivo" : `${fmt(Math.abs(diff), 0)} kcal ${diff > 0 ? "sopra" : "sotto"} l'obiettivo di ${fmt(imp.kcal_obiettivo, 0)}`}${soloAll.kcal ? ` · di cui ${fmt(soloAll.kcal, 0)} kcal solo nei giorni di allenamento` : ""}</p>` : ""}
      </div>
      <ol class="pasti">
        ${D.PASTI_PIANO.map(([p, n]) => {
          const x = pastoDi(giornoPiano, p);
          const voci = x ? D.vociDi(x.id) : [];
          const v = D.somma(voci.map(D.valoriVoce));
          return `<li class="pasto ${x ? "" : "vuoto-pasto"}">
            <div class="pasto-testa"><span class="pasto-nome">${n}</span><span class="pasto-stato">${voci.length ? fmt(v.kcal, 0) + " kcal" : "vuoto"}</span></div>
            ${x && (x.nome || x.solo_allenamento) ? `<p class="pasto-sotto">${esc(x.nome || "")}${x.solo_allenamento ? `${x.nome ? " · " : ""}<em>solo nei giorni di allenamento</em>` : ""}</p>` : ""}
            ${voci.length ? `<ul class="voci">${voci.map((vo) => `<li><button type="button" class="voce" data-voce="${vo.id}">
                <span class="voce-nome">${esc(D.nomeVoce(vo))} <small>${D.quantitaVoce(vo)}</small></span>
                <span class="voce-kcal">${fmt(D.valoriVoce(vo).kcal, 0)}</span></button></li>`).join("")}</ul>` : ""}
            ${x && x.note ? `<p class="nota-pasto">${esc(x.note)}</p>` : ""}
            <div class="pasto-azioni">
              <button type="button" class="bottone piccolo" data-azione="voce-nuova" data-pasto="${p}">+ Aggiungi</button>
              <button type="button" class="bottone piccolo" data-azione="pasto-dettagli" data-pasto="${p}">${x ? "Nome, note, copia" : "Nome e note"}</button>
            </div>
          </li>`;
        }).join("")}
      </ol>
      <div class="azioni-riga larga">
        <button type="button" class="bottone secondario stretto" data-azione="copia-giorno" ${pasti.length ? "" : "disabled"}>Copia ${D.GIORNI[giornoPiano - 1].toLowerCase()} su altri giorni…</button>
      </div>`;
  }

  async function assicuraPasto(p) {
    const esiste = pastoDi(giornoPiano, p);
    if (esiste) return esiste;
    return D.dati((c) => c.from("piano_pasti")
      .insert({ giorno_settimana: giornoPiano, pasto: p, solo_allenamento: p === "pre_allenamento" })
      .select().single());
  }

  async function nuovaVoce(p) {
    const s = await D.scegliCibo({ titolo: `${D.GIORNI[giornoPiano - 1]} · ${D.nomePasto(p).toLowerCase()}` });
    if (!s) return;
    const pasto = await assicuraPasto(p);
    const ordine = D.vociDi(pasto.id).length;
    const voce = s.tipo === "alimento"
      ? { piano_pasto_id: pasto.id, alimento_id: s.item.id, grammi: s.grammi, ordine }
      : { piano_pasto_id: pasto.id, ricetta_id: s.item.id, porzioni: s.porzioni, ordine };
    await D.dati((c) => c.from("piano_voci").insert(voce));
    await D.ricarica("piano");
    disegna();
  }

  async function modificaVoce(id) {
    const v = D.cache.pianoVoci.find((x) => x.id === id);
    if (!v) return;
    const isAlim = !!v.alimento_id;
    const item = isAlim ? D.alimento(v.alimento_id) : D.ricetta(v.ricetta_id);
    const voci = D.vociDi(v.piano_pasto_id);
    const pos = voci.findIndex((x) => x.id === id);
    let sposta = 0;
    await D.foglio({
      titolo: D.nomeVoce(v), elimina: "Togli dal pasto",
      html: `${D.campo(isAlim ? "Grammi" : "Porzioni", "q", D.perCampo(isAlim ? v.grammi : v.porzioni), { decimale: true, richiesto: true, attrs: "autofocus" })}
        <p class="anteprima" data-anteprima></p>
        ${voci.length > 1 ? `<div class="azioni-riga">
          <button type="button" class="chip" data-sposta="-1" ${pos === 0 ? "disabled" : ""}>↑ Sposta su</button>
          <button type="button" class="chip" data-sposta="1" ${pos === voci.length - 1 ? "disabled" : ""}>↓ Sposta giù</button></div>` : ""}`,
      prepara(form, chiudi) {
        const ant = $("[data-anteprima]", form);
        const agg = () => { const q = D.num(form.q.value); ant.textContent = item && q > 0 ? D.macroBreve(isAlim ? D.valoriAlimento(item, q) : D.valoriRicetta(item, q)) : ""; };
        form.q.addEventListener("input", agg);
        agg();
        $$("[data-sposta]", form).forEach((b) => b.addEventListener("click", () => { sposta = Number(b.dataset.sposta); chiudi("sposta"); }));
      },
      async salva(d, form, tipo) {
        if (tipo === "elimina") {
          await D.dati((c) => c.from("piano_voci").delete().eq("id", id));
        } else {
          const q = D.num(d.q);
          if (!q || q <= 0) return "Scrivi una quantità maggiore di zero.";
          await D.dati((c) => c.from("piano_voci").update(isAlim ? { grammi: q } : { porzioni: q }).eq("id", id));
        }
        await D.ricarica("piano");
        disegna();
        return undefined;
      },
    }).then(async (esito) => {
      if (esito !== "sposta") return;
      const nuovo = voci.slice();
      const [tolta] = nuovo.splice(pos, 1);
      nuovo.splice(pos + sposta, 0, tolta);
      await Promise.all(nuovo.map((x, i) => (x.ordine === i ? null : D.dati((c) => c.from("piano_voci").update({ ordine: i }).eq("id", x.id)))));
      await D.ricarica("piano");
      disegna();
    });
  }

  function sceltaGiorni(escluso, nome = "giorni") {
    return `<div class="chips giorni">${D.GIORNI_BREVI.map((g, i) => i + 1 === escluso ? "" :
      `<label class="chip-spunta"><input type="checkbox" name="${nome}" value="${i + 1}"><span>${g}</span></label>`).join("")}</div>`;
  }

  // Copia i pasti indicati sugli altri giorni, sostituendo quelli che ci sono.
  async function copiaPasti(sorgenti, giorni, tuttoIlGiorno) {
    for (const g of giorni) {
      let canc = (c) => c.from("piano_pasti").delete().eq("giorno_settimana", g);
      if (!tuttoIlGiorno) { const tipi = sorgenti.map((s) => s.pasto); canc = (c) => c.from("piano_pasti").delete().eq("giorno_settimana", g).in("pasto", tipi); }
      await D.dati(canc);
      if (!sorgenti.length) continue;
      const nuovi = await D.dati((c) => c.from("piano_pasti").insert(sorgenti.map((s) => ({
        giorno_settimana: g, pasto: s.pasto, nome: s.nome, solo_allenamento: s.solo_allenamento, note: s.note,
      }))).select());
      const voci = [];
      nuovi.forEach((n) => {
        const s = sorgenti.find((x) => x.pasto === n.pasto);
        D.vociDi(s.id).forEach((v) => voci.push({
          piano_pasto_id: n.id, alimento_id: v.alimento_id, ricetta_id: v.ricetta_id, grammi: v.grammi, porzioni: v.porzioni, ordine: v.ordine,
        }));
      });
      if (voci.length) await D.dati((c) => c.from("piano_voci").insert(voci));
    }
    await D.ricarica("piano");
  }

  async function dettagliPasto(p) {
    const x = pastoDi(giornoPiano, p);
    await D.foglio({
      titolo: `${D.GIORNI[giornoPiano - 1]} · ${D.nomePasto(p)}`, elimina: x ? "Svuota questo pasto" : false,
      html: `${D.campo("Nome breve (facoltativo)", "nome", x?.nome || "", { segnaposto: "es. Pasta al tonno" })}
        ${D.spunta("Solo nei giorni di allenamento", "solo_allenamento", x ? x.solo_allenamento : p === "pre_allenamento")}
        ${D.areaTesto("Note", "note", x?.note || "", 3)}
        ${x ? `<p class="campo-titolo">Copia questo pasto anche su (sostituisce quello che c'è):</p>${sceltaGiorni(giornoPiano)}` : ""}`,
      async salva(d, form, tipo) {
        if (tipo === "elimina") {
          await D.dati((c) => c.from("piano_pasti").delete().eq("id", x.id));
        } else {
          const campi = { nome: d.nome.trim() || null, note: d.note.trim() || null, solo_allenamento: !!d.solo_allenamento };
          let riga = x;
          if (x) await D.dati((c) => c.from("piano_pasti").update(campi).eq("id", x.id));
          else riga = await D.dati((c) => c.from("piano_pasti").insert({ giorno_settimana: giornoPiano, pasto: p, ...campi }).select().single());
          const giorni = $$("input[name=giorni]:checked", form).map((i) => Number(i.value));
          if (giorni.length) {
            await D.ricarica("piano");
            await copiaPasti([{ ...riga, ...campi }], giorni, false);
            D.avviso(`Copiato su ${giorni.length} ${giorni.length === 1 ? "giorno" : "giorni"}`);
          }
        }
        await D.ricarica("piano");
        disegna();
        return undefined;
      },
    });
  }

  async function copiaGiorno() {
    const sorgenti = D.cache.pianoPasti.filter((x) => x.giorno_settimana === giornoPiano);
    await D.foglio({
      titolo: `Copia ${D.GIORNI[giornoPiano - 1].toLowerCase()}`, conferma: "Copia",
      html: `<p class="sottotitolo-foglio">Su quali giorni? Tutti i pasti di quei giorni vengono <b>sostituiti</b> con quelli di ${D.GIORNI[giornoPiano - 1].toLowerCase()}.</p>${sceltaGiorni(giornoPiano)}`,
      async salva(d, form) {
        const giorni = $$("input[name=giorni]:checked", form).map((i) => Number(i.value));
        if (!giorni.length) return "Scegli almeno un giorno.";
        await copiaPasti(sorgenti, giorni, true);
        D.avviso(`Copiato su ${giorni.length} ${giorni.length === 1 ? "giorno" : "giorni"}`);
        disegna();
        return undefined;
      },
    });
  }

  // ===================================================================
  // RICETTE
  // ===================================================================
  function vistaRicette() {
    const elenco = D.cache.ricette.filter((r) => archiviati || !r.archiviata);
    return `
      <div class="azioni-riga larga">
        <button type="button" class="bottone piccolo primario" data-azione="ricetta-nuova">+ Nuova ricetta</button>
        <label class="spunta piccola"><input type="checkbox" data-archiviati ${archiviati ? "checked" : ""}><span>Mostra archiviate</span></label>
      </div>
      <ul class="schede-elenco">
        ${elenco.length ? elenco.map((r) => `<li><button type="button" class="scheda-voce ${r.archiviata ? "archiviata" : ""}" data-ricetta="${r.id}">
            <span class="scheda-nome">${esc(r.nome)}${r.archiviata ? " <small>archiviata</small>" : ""}</span>
            <span class="scheda-info">${fmt(r.kcal_porzione, 0)} kcal a porzione · P ${fmt(r.proteine_porzione_g, 0)} · C ${fmt(r.carboidrati_porzione_g, 0)} · G ${fmt(r.grassi_porzione_g, 0)}</span>
            <span class="scheda-info">${fmt(r.porzioni, 1)} ${Number(r.porzioni) === 1 ? "porzione" : "porzioni"}${r.tempo_minuti ? ` · ${r.tempo_minuti} min` : ""}</span>
          </button></li>`).join("") : `<li class="vuoto piccolo"><p class="segnaposto">Nessuna ricetta. Gli ingredienti si scelgono tra i tuoi alimenti, in grammi: le calorie a porzione si calcolano da sole.</p></li>`}
      </ul>`;
  }

  function vistaRicetta() {
    const r = D.ricetta(ricettaAperta);
    if (!r) { ricettaAperta = null; return vistaRicette(); }
    const ingr = D.cache.ingredienti.filter((i) => i.ricetta_id === r.id);
    const perPorz = { kcal: r.kcal_porzione, proteine_g: r.proteine_porzione_g, carboidrati_g: r.carboidrati_porzione_g, grassi_g: r.grassi_porzione_g };
    return `
      <button type="button" class="indietro" data-azione="ricette-elenco">‹ Tutte le ricette</button>
      <h2 class="titolo-medio">${esc(r.nome)}</h2>
      <p class="segnaposto">${fmt(r.porzioni, 1)} ${Number(r.porzioni) === 1 ? "porzione" : "porzioni"}${r.tempo_minuti ? ` · ${r.tempo_minuti} minuti` : ""}${r.grammi_totali ? ` · ${fmt(r.grammi_totali / r.porzioni, 0)} g a porzione (a crudo)` : ""}${r.archiviata ? " · archiviata" : ""}</p>
      <div class="riquadro"><p class="riquadro-titolo">Per porzione</p>${totaleRiga(perPorz)}</div>
      <h3 class="occhiello">Ingredienti</h3>
      <ul class="voci elenco-bianco">
        ${ingr.map((i) => { const a = D.alimento(i.alimento_id); return `<li><button type="button" class="voce" data-ingrediente="${i.id}">
          <span class="voce-nome">${esc(a ? a.nome : "?")} <small>${fmt(i.grammi)} g${i.nota ? " · " + esc(i.nota) : ""}</small></span>
          <span class="voce-kcal">${a ? fmt(D.valoriAlimento(a, i.grammi).kcal, 0) : ""}</span></button></li>`; }).join("")
          || `<li class="segnaposto voce">Ancora nessun ingrediente.</li>`}
      </ul>
      <div class="azioni-riga"><button type="button" class="bottone piccolo" data-azione="ingrediente-nuovo">+ Ingrediente</button></div>
      ${r.procedimento ? `<h3 class="occhiello">Procedimento</h3><div class="testo-lungo">${esc(r.procedimento).replace(/\n/g, "<br>")}</div>` : ""}
      ${r.note ? `<h3 class="occhiello">Note</h3><div class="testo-lungo">${esc(r.note).replace(/\n/g, "<br>")}</div>` : ""}
      <div class="azioni-riga larga">
        <button type="button" class="bottone piccolo" data-azione="ricetta-dati">Modifica nome, porzioni, procedimento</button>
        <button type="button" class="bottone piccolo" data-azione="ricetta-duplica">Duplica</button>
        <button type="button" class="bottone piccolo" data-azione="ricetta-archivia">${r.archiviata ? "Ripristina" : "Archivia"}</button>
      </div>`;
  }

  async function datiRicetta(r) {
    let nuovaId = null;
    await D.foglio({
      titolo: r ? "Modifica ricetta" : "Nuova ricetta", elimina: r ? "Elimina ricetta" : false,
      html: `${D.campo("Nome", "nome", r?.nome || "", { richiesto: true, attrs: "autofocus" })}
        <div class="griglia-2">
          ${D.campo("Porzioni", "porzioni", D.perCampo(r?.porzioni ?? 1), { decimale: true, richiesto: true })}
          ${D.campo("Tempo (minuti)", "tempo_minuti", r?.tempo_minuti ?? "", { intero: true })}
        </div>
        ${D.areaTesto("Procedimento", "procedimento", r?.procedimento || "", 6)}
        ${D.areaTesto("Note", "note", r?.note || "", 2)}`,
      async salva(d, form, tipo) {
        if (tipo === "elimina") {
          await D.dati((c) => c.from("ricette").delete().eq("id", r.id));
          ricettaAperta = null;
        } else {
          const porzioni = D.num(d.porzioni);
          const tempo = D.num(d.tempo_minuti);
          if (!d.nome.trim()) return "Scrivi il nome.";
          if (!porzioni || porzioni <= 0) return "Le porzioni devono essere più di zero.";
          if (tempo !== null && (tempo < 0 || !Number.isInteger(tempo))) return "Il tempo è in minuti interi.";
          const campi = { nome: d.nome.trim(), porzioni, tempo_minuti: tempo, procedimento: d.procedimento.trim() || null, note: d.note.trim() || null };
          if (r) await D.dati((c) => c.from("ricette").update(campi).eq("id", r.id));
          else nuovaId = (await D.dati((c) => c.from("ricette").insert(campi).select("id").single())).id;
        }
        await D.ricarica("ricette", "ingredienti");
        if (nuovaId) ricettaAperta = nuovaId;
        disegna();
        return undefined;
      },
    });
  }

  async function nuovoIngrediente() {
    const s = await D.scegliCibo({ titolo: "Ingrediente", ricette: false });
    if (!s) return;
    const ordine = D.cache.ingredienti.filter((i) => i.ricetta_id === ricettaAperta).length;
    await D.dati((c) => c.from("ricetta_ingredienti").insert({ ricetta_id: ricettaAperta, alimento_id: s.item.id, grammi: s.grammi, ordine }));
    await D.ricarica("ricette", "ingredienti");
    disegna();
  }

  async function modificaIngrediente(id) {
    const i = D.cache.ingredienti.find((x) => x.id === id);
    const a = i && D.alimento(i.alimento_id);
    if (!i) return;
    await D.foglio({
      titolo: a ? a.nome : "Ingrediente", elimina: "Togli dalla ricetta",
      html: `<div class="griglia-2">${D.campo("Grammi", "grammi", D.perCampo(i.grammi), { decimale: true, richiesto: true, attrs: "autofocus" })}
        ${D.campo("Nota", "nota", i.nota || "", { segnaposto: "es. a crudo" })}</div>`,
      async salva(d, form, tipo) {
        if (tipo === "elimina") await D.dati((c) => c.from("ricetta_ingredienti").delete().eq("id", id));
        else {
          const g = D.num(d.grammi);
          if (!g || g <= 0) return "I grammi devono essere più di zero.";
          await D.dati((c) => c.from("ricetta_ingredienti").update({ grammi: g, nota: d.nota.trim() || null }).eq("id", id));
        }
        await D.ricarica("ricette", "ingredienti");
        disegna();
        return undefined;
      },
    });
  }

  async function duplicaRicetta() {
    const r = D.ricetta(ricettaAperta);
    const copia = await D.dati((c) => c.from("ricette").insert({
      nome: r.nome + " (copia)", porzioni: r.porzioni, procedimento: r.procedimento, tempo_minuti: r.tempo_minuti, note: r.note,
    }).select("id").single());
    const ingr = D.cache.ingredienti.filter((i) => i.ricetta_id === r.id)
      .map((i) => ({ ricetta_id: copia.id, alimento_id: i.alimento_id, grammi: i.grammi, nota: i.nota, ordine: i.ordine }));
    if (ingr.length) await D.dati((c) => c.from("ricetta_ingredienti").insert(ingr));
    await D.ricarica("ricette", "ingredienti");
    ricettaAperta = copia.id;
    disegna();
    D.avviso("Ricetta duplicata");
  }

  async function archiviaRicetta() {
    const r = D.ricetta(ricettaAperta);
    await D.dati((c) => c.from("ricette").update({ archiviata: !r.archiviata }).eq("id", r.id));
    await D.ricarica("ricette");
    disegna();
  }

  // ===================================================================
  // ALIMENTI
  // ===================================================================
  function vistaAlimenti() {
    return `
      <label class="campo cerca"><span>Cerca</span><input type="search" data-cerca value="${esc(cerca)}" placeholder="Nome o marca" autocomplete="off"></label>
      <div class="azioni-riga larga">
        <button type="button" class="bottone piccolo primario" data-azione="alimento-nuovo">+ Nuovo</button>
        <button type="button" class="bottone piccolo" data-azione="alimento-barre">Codice a barre</button>
        <label class="spunta piccola"><input type="checkbox" data-archiviati ${archiviati ? "checked" : ""}><span>Archiviati</span></label>
      </div>
      <ul class="schede-elenco" id="alimenti-elenco"></ul>`;
  }

  function disegnaAlimenti() {
    const q = cerca.trim().toLowerCase();
    const elenco = D.cache.alimenti
      .filter((a) => (archiviati || !a.archiviato) && (!q || `${a.nome} ${a.marca || ""}`.toLowerCase().includes(q)))
      .sort((a, b) => (b.preferito - a.preferito) || a.nome.localeCompare(b.nome, "it"));
    $("#alimenti-elenco").innerHTML = elenco.length ? elenco.map((a) => `<li><button type="button" class="scheda-voce ${a.archiviato ? "archiviata" : ""}" data-alimento="${a.id}">
        <span class="scheda-nome">${a.preferito ? "★ " : ""}${esc(a.nome)}${a.marca ? ` <small>${esc(a.marca)}</small>` : ""}${a.archiviato ? " <small>archiviato</small>" : ""}</span>
        <span class="scheda-info">${fmt(a.kcal_100g, 0)} kcal · P ${fmt(a.proteine_100g)} · C ${fmt(a.carboidrati_100g)} · G ${fmt(a.grassi_100g)} <small>per 100 g</small></span>
        ${a.porzione_g ? `<span class="scheda-info">${esc(a.porzione_nome || "porzione")}: ${fmt(a.porzione_g)} g</span>` : ""}
      </button></li>`).join("")
      : `<li class="vuoto piccolo"><p class="segnaposto">${D.cache.alimenti.length ? "Nessun risultato." : "Nessun alimento salvato. Aggiungili a mano (valori per 100 g, dall'etichetta) o con il codice a barre."}</p></li>`;
  }

  // Crea o modifica un alimento. Restituisce l'alimento salvato, o null.
  async function modificaAlimento(a, base = {}) {
    const v = { ...base, ...(a || {}) };
    let salvato = null;
    await D.foglio({
      titolo: a ? "Modifica alimento" : "Nuovo alimento", elimina: a ? true : false,
      html: `${base.avviso ? `<p class="sottotitolo-foglio">${esc(base.avviso)}</p>` : ""}
        ${D.campo("Nome", "nome", v.nome || "", { richiesto: true, attrs: a ? "" : "autofocus" })}
        <div class="griglia-2">
          ${D.campo("Marca", "marca", v.marca || "")}
          ${D.campo("Codice a barre", "codice_barre", v.codice_barre || "", { intero: true })}
        </div>
        <p class="campo-titolo">Valori per 100 g</p>
        <div class="griglia-4">
          ${D.campo("kcal", "kcal_100g", D.perCampo(v.kcal_100g ?? ""), { decimale: true, richiesto: true })}
          ${D.campo("Proteine", "proteine_100g", D.perCampo(v.proteine_100g ?? ""), { decimale: true })}
          ${D.campo("Carboidrati", "carboidrati_100g", D.perCampo(v.carboidrati_100g ?? ""), { decimale: true })}
          ${D.campo("Grassi", "grassi_100g", D.perCampo(v.grassi_100g ?? ""), { decimale: true })}
        </div>
        <p class="segnaposto piccolo" data-stima></p>
        <div class="griglia-2">
          ${D.campo("Porzione abituale (g)", "porzione_g", D.perCampo(v.porzione_g ?? ""), { decimale: true })}
          ${D.campo("Nome porzione", "porzione_nome", v.porzione_nome || "", { segnaposto: "es. 1 vasetto" })}
        </div>
        ${D.spunta("Preferito (in cima agli elenchi)", "preferito", v.preferito)}
        ${a ? D.spunta("Archiviato (nascosto dagli elenchi)", "archiviato", v.archiviato) : ""}
        ${v.fonte === "openfoodfacts" ? `<p class="segnaposto piccolo">Dati da Open Food Facts: controllali con l'etichetta.</p>` : ""}`,
      prepara(form) {
        const stima = $("[data-stima]", form);
        const agg = () => {
          const p = D.num(form.proteine_100g.value) || 0, c = D.num(form.carboidrati_100g.value) || 0, g = D.num(form.grassi_100g.value) || 0;
          stima.textContent = p || c || g ? `Dai macro risultano circa ${fmt(p * 4 + c * 4 + g * 9, 0)} kcal (4/4/9).` : "";
        };
        ["proteine_100g", "carboidrati_100g", "grassi_100g"].forEach((k) => form[k].addEventListener("input", agg));
        agg();
      },
      async salva(d, form, tipo) {
        if (tipo === "elimina") {
          await D.dati((c) => c.from("alimenti").delete().eq("id", a.id));
          await D.ricarica("alimenti");
          return undefined;
        }
        const n = (k) => D.num(d[k]);
        const campi = {
          nome: d.nome.trim(), marca: d.marca.trim() || null, codice_barre: d.codice_barre.replace(/\D/g, "") || null,
          kcal_100g: n("kcal_100g"), proteine_100g: n("proteine_100g") ?? 0, carboidrati_100g: n("carboidrati_100g") ?? 0, grassi_100g: n("grassi_100g") ?? 0,
          porzione_g: n("porzione_g"), porzione_nome: d.porzione_nome.trim() || null, preferito: !!d.preferito,
        };
        if (a) campi.archiviato = !!d.archiviato;
        else campi.fonte = v.fonte === "openfoodfacts" ? "openfoodfacts" : "manuale";
        if (!campi.nome) return "Scrivi il nome.";
        if (campi.kcal_100g === null) return "Scrivi le calorie per 100 g.";
        if ([campi.kcal_100g, campi.proteine_100g, campi.carboidrati_100g, campi.grassi_100g].some((x) => x < 0)) return "I valori non possono essere negativi.";
        if (campi.proteine_100g + campi.carboidrati_100g + campi.grassi_100g > 100.5) return "Proteine + carboidrati + grassi non possono superare 100 g.";
        if (campi.porzione_g !== null && campi.porzione_g <= 0) return "La porzione deve essere più di zero grammi.";
        if (campi.codice_barre && !/^[0-9]{6,14}$/.test(campi.codice_barre)) return "Il codice a barre ha da 6 a 14 cifre.";
        ["kcal_100g", "proteine_100g", "carboidrati_100g", "grassi_100g", "porzione_g"].forEach((k) => { if (campi[k] !== null) campi[k] = D.arr1(campi[k]); });
        try {
          salvato = a
            ? await D.dati((c) => c.from("alimenti").update(campi).eq("id", a.id).select().single())
            : await D.dati((c) => c.from("alimenti").insert(campi).select().single());
        } catch (e) {
          if (e.code === "23505") return "Hai già un alimento con questo codice a barre.";
          throw e;
        }
        await D.ricarica("alimenti", "ricette");
        return undefined;
      },
    });
    return salvato;
  }

  // ---------- Codice a barre ----------
  async function cercaOpenFoodFacts(codice) {
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(codice)}.json?fields=product_name,product_name_it,brands,nutriments,serving_quantity,serving_size`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error("Open Food Facts non risponde (" + r.status + ")");
    const j = await r.json();
    if (j.status !== 1 || !j.product) return null;
    const p = j.product, nu = p.nutriments || {};
    const kcal = nu["energy-kcal_100g"] ?? (nu.energy_100g ? nu.energy_100g / 4.184 : null);
    const sq = Number(p.serving_quantity);
    return {
      nome: (p.product_name_it || p.product_name || "").trim() || `Prodotto ${codice}`,
      marca: (p.brands || "").split(",")[0].trim() || null,
      codice_barre: codice,
      kcal_100g: kcal !== null ? D.arr1(kcal) : null,
      proteine_100g: nu.proteins_100g != null ? D.arr1(nu.proteins_100g) : null,
      carboidrati_100g: nu.carbohydrates_100g != null ? D.arr1(nu.carbohydrates_100g) : null,
      grassi_100g: nu.fat_100g != null ? D.arr1(nu.fat_100g) : null,
      porzione_g: sq > 0 ? D.arr1(sq) : null,
      porzione_nome: p.serving_size ? String(p.serving_size).slice(0, 40) : null,
      fonte: "openfoodfacts",
    };
  }

  // Fotocamera: BarcodeDetector dove c'è, altrimenti ZXing (caricato solo ora).
  function caricaZXing() {
    if (window.ZXing) return Promise.resolve();
    return new Promise((ok, ko) => {
      const s = document.createElement("script");
      s.src = "vendor/zxing-library-0.21.3.min.js";
      s.onload = ok;
      s.onerror = () => ko(new Error("non riesco a caricare il lettore di codici"));
      document.head.appendChild(s);
    });
  }

  async function avviaScanner(video, trovato) {
    if ("BarcodeDetector" in window) {
      const formati = await window.BarcodeDetector.getSupportedFormats();
      if (formati.includes("ean_13")) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        video.srcObject = stream;
        await video.play();
        const det = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
        let attivo = true;
        const giro = async () => {
          if (!attivo) return;
          try { const r = await det.detect(video); if (r.length) { attivo = false; trovato(r[0].rawValue); return; } } catch { /* riprova */ }
          setTimeout(giro, 200);
        };
        giro();
        return () => { attivo = false; stream.getTracks().forEach((t) => t.stop()); };
      }
    }
    await caricaZXing();
    const Z = window.ZXing;
    const suggerimenti = new Map([[Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E]]]);
    const lettore = new Z.BrowserMultiFormatReader(suggerimenti, 250);
    let fatto = false;
    await lettore.decodeFromConstraints({ video: { facingMode: "environment" }, audio: false }, video, (r) => {
      if (r && !fatto) { fatto = true; trovato(r.getText()); }
    });
    return () => lettore.reset();
  }

  async function alimentoDaCodice() {
    let ferma = null;
    let codice = null;
    const puoFoto = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    const esito = await D.foglio({
      titolo: "Codice a barre", conferma: "Cerca",
      html: `${D.campo("Numero sotto il codice", "codice", "", { intero: true, segnaposto: "es. 8001234567890", attrs: puoFoto ? "" : "autofocus" })}
        ${puoFoto ? `<button type="button" class="bottone secondario stretto" data-foto>Inquadra con la fotocamera</button>
          <div class="scanner" hidden><video playsinline muted></video><p class="segnaposto piccolo">Inquadra il codice a barre, ben illuminato.</p></div>` : ""}
        <p class="segnaposto piccolo">Cerco prima tra i tuoi alimenti, poi su Open Food Facts.</p>`,
      prepara(form) {
        const b = $("[data-foto]", form);
        if (!b) return;
        b.addEventListener("click", async () => {
          b.hidden = true;
          const box = $(".scanner", form);
          box.hidden = false;
          try {
            ferma = await avviaScanner($("video", box), (c) => {
              form.codice.value = c;
              if (ferma) ferma();
              ferma = null;
              box.hidden = true;
              form.requestSubmit();
            });
          } catch (e) {
            box.hidden = true;
            b.hidden = false;
            D.avviso("Fotocamera non disponibile: " + (e.name === "NotAllowedError" ? "permesso negato" : e.message), "errore");
          }
        });
      },
      salva(d) {
        codice = d.codice.replace(/\D/g, "");
        if (!/^[0-9]{6,14}$/.test(codice)) return "Il codice ha da 6 a 14 cifre.";
        return undefined;
      },
    });
    if (ferma) ferma();
    if (esito !== "ok") return null;

    const mio = D.cache.alimenti.find((a) => a.codice_barre === codice);
    if (mio) {
      if (mio.archiviato) await D.dati((c) => c.from("alimenti").update({ archiviato: false }).eq("id", mio.id)).then(() => D.ricarica("alimenti"));
      D.avviso("Già nei tuoi alimenti: " + mio.nome);
      return D.alimento(mio.id);
    }
    let trovato = null;
    try {
      D.avviso("Cerco su Open Food Facts…");
      trovato = await cercaOpenFoodFacts(codice);
    } catch (e) {
      return modificaAlimento(null, { codice_barre: codice, avviso: "Open Food Facts non ha risposto: copia i valori dall'etichetta." });
    }
    if (!trovato) return modificaAlimento(null, { codice_barre: codice, avviso: "Prodotto non trovato su Open Food Facts: copia i valori dall'etichetta." });
    return modificaAlimento(null, { ...trovato, avviso: "Trovato su Open Food Facts. Controlla i valori e salva." });
  }

  // ===================================================================
  // DRINK
  // ===================================================================
  function vistaDrink() {
    const elenco = D.cache.bevande.filter((b) => archiviati || !b.archiviata);
    return `
      <p class="segnaposto">I drink compaiono in Oggi → Uscita: un tocco e sono nel diario. Valori indicativi, modificabili.</p>
      <div class="azioni-riga larga">
        <button type="button" class="bottone piccolo primario" data-azione="drink-nuovo">+ Nuovo drink</button>
        <label class="spunta piccola"><input type="checkbox" data-archiviati ${archiviati ? "checked" : ""}><span>Archiviati</span></label>
      </div>
      <ul class="schede-elenco">${elenco.map((b) => `<li><button type="button" class="scheda-voce ${b.archiviata ? "archiviata" : ""}" data-drink-modifica="${b.id}">
        <span class="scheda-nome">${esc(b.nome)}${b.archiviata ? " <small>archiviato</small>" : ""}</span>
        <span class="scheda-info">${fmt(b.kcal, 0)} kcal${b.quantita_ml ? ` · ${b.quantita_ml} ml` : ""}${b.carboidrati_g ? ` · C ${fmt(b.carboidrati_g)} g` : ""}</span>
      </button></li>`).join("")}</ul>`;
  }

  async function modificaDrink(b) {
    await D.foglio({
      titolo: b ? "Modifica drink" : "Nuovo drink", elimina: b ? true : false,
      html: `${D.campo("Nome", "nome", b?.nome || "", { richiesto: true, attrs: b ? "" : "autofocus" })}
        <div class="griglia-2">${D.campo("Quantità (ml)", "quantita_ml", b?.quantita_ml ?? "", { intero: true })}${D.campo("kcal", "kcal", D.perCampo(b?.kcal ?? ""), { decimale: true, richiesto: true })}</div>
        <div class="griglia-4">
          ${D.campo("Proteine g", "proteine_g", D.perCampo(b?.proteine_g ?? 0), { decimale: true })}
          ${D.campo("Carboidrati g", "carboidrati_g", D.perCampo(b?.carboidrati_g ?? 0), { decimale: true })}
          ${D.campo("Grassi g", "grassi_g", D.perCampo(b?.grassi_g ?? 0), { decimale: true })}
          ${D.campo("Ordine", "ordine", b?.ordine ?? D.cache.bevande.length + 1, { intero: true })}
        </div>
        ${b ? D.spunta("Archiviato (non compare in Uscita)", "archiviata", b.archiviata) : ""}`,
      async salva(d, form, tipo) {
        if (tipo === "elimina") {
          await D.dati((c) => c.from("bevande").delete().eq("id", b.id));
        } else {
          const n = (k) => D.num(d[k]);
          const campi = {
            nome: d.nome.trim(), quantita_ml: n("quantita_ml"), kcal: n("kcal"),
            proteine_g: n("proteine_g") ?? 0, carboidrati_g: n("carboidrati_g") ?? 0, grassi_g: n("grassi_g") ?? 0, ordine: n("ordine") ?? 0,
          };
          if (b) campi.archiviata = !!d.archiviata;
          if (!campi.nome) return "Scrivi il nome.";
          if (campi.kcal === null || campi.kcal < 0) return "Scrivi le calorie.";
          if (campi.quantita_ml !== null && (campi.quantita_ml <= 0 || !Number.isInteger(campi.quantita_ml))) return "La quantità è in ml interi.";
          try {
            if (b) await D.dati((c) => c.from("bevande").update(campi).eq("id", b.id));
            else await D.dati((c) => c.from("bevande").insert(campi));
          } catch (e) {
            if (e.code === "23505") return "Esiste già un drink con questo nome.";
            throw e;
          }
        }
        await D.ricarica("bevande");
        disegna();
        return undefined;
      },
    });
  }

  // ===================================================================
  // Eventi
  // ===================================================================
  const sez = $("#sezione-cucina");
  sez.addEventListener("click", (e) => {
    const t = e.target.closest("[data-scheda],[data-giorno-piano],[data-voce],[data-azione],[data-ricetta],[data-ingrediente],[data-alimento],[data-drink-modifica]");
    if (!t) return;
    if (t.dataset.scheda) { scheda = t.dataset.scheda; scrivi("dieta-scheda-cucina", scheda); disegna(); return; }
    if (t.dataset.giornoPiano) { giornoPiano = Number(t.dataset.giornoPiano); disegna(); return; }
    if (t.dataset.voce) { D.azione(() => modificaVoce(t.dataset.voce)); return; }
    if (t.dataset.ricetta) { ricettaAperta = t.dataset.ricetta; disegna(); window.scrollTo(0, 0); return; }
    if (t.dataset.ingrediente) { D.azione(() => modificaIngrediente(t.dataset.ingrediente)); return; }
    if (t.dataset.alimento) { D.azione(async () => { await modificaAlimento(D.alimento(t.dataset.alimento)); disegna(); }); return; }
    if (t.dataset.drinkModifica) { D.azione(() => modificaDrink(D.cache.bevande.find((b) => b.id === t.dataset.drinkModifica))); return; }
    const p = t.dataset.pasto;
    const azioni = {
      "voce-nuova": () => nuovaVoce(p),
      "pasto-dettagli": () => dettagliPasto(p),
      "copia-giorno": copiaGiorno,
      "ricetta-nuova": () => datiRicetta(null),
      "ricetta-dati": () => datiRicetta(D.ricetta(ricettaAperta)),
      "ricetta-duplica": duplicaRicetta,
      "ricetta-archivia": archiviaRicetta,
      "ricette-elenco": async () => { ricettaAperta = null; disegna(); },
      "ingrediente-nuovo": nuovoIngrediente,
      "alimento-nuovo": async () => { await modificaAlimento(null); disegna(); },
      "alimento-barre": async () => { await alimentoDaCodice(); disegna(); },
      "drink-nuovo": () => modificaDrink(null),
    };
    if (azioni[t.dataset.azione]) D.azione(azioni[t.dataset.azione]);
  });
  sez.addEventListener("input", (e) => {
    if (e.target.matches("[data-cerca]")) { cerca = e.target.value; disegnaAlimenti(); }
  });
  sez.addEventListener("change", (e) => {
    if (e.target.matches("[data-archiviati]")) { archiviati = e.target.checked; disegna(); }
  });

  D.modificaAlimento = modificaAlimento;
  D.alimentoDaCodice = alimentoDaCodice;
  D.sezione("cucina", { carica });
})();
