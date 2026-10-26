/* =====================================================================
   Dieta — Spesa
   Lista della settimana (settimana = lunedì). Aggiunta veloce, spunta,
   modifica, generazione dal piano settimanale, pulizia delle spuntate.
   ===================================================================== */
(function () {
  "use strict";
  const D = window.Dieta;
  const { $, esc, fmt } = D;

  const CATEGORIE = ["Frutta e verdura", "Carne e pesce", "Latticini e uova", "Pane, pasta e cereali", "Dispensa", "Surgelati", "Bevande", "Casa", "Dal piano"];
  let settimana = D.lunediDi(D.oggiIso());
  let voci = [];

  async function carica() {
    const s = settimana;
    const righe = await D.dati((c) => c.from("spesa_voci").select("*").eq("settimana", s).order("ordine").order("created_at"));
    if (s !== settimana) return;
    voci = righe;
    disegna();
  }

  function disegna() {
    const corrente = D.lunediDi(D.oggiIso());
    $("#spesa-settimana").textContent = settimana === corrente ? "Questa settimana"
      : settimana === D.piuGiorni(corrente, 7) ? "Settimana prossima"
        : settimana === D.piuGiorni(corrente, -7) ? "Settimana scorsa"
          : `Settimana del ${D.dataBreve(settimana)}`;
    $("#spesa-date").textContent = `dal ${D.dataBreve(settimana)} al ${D.dataBreve(D.piuGiorni(settimana, 6))}`;

    const fatte = voci.filter((v) => v.spuntata).length;
    $("#spesa-conto").textContent = voci.length ? `${fatte} di ${voci.length} presi` : "";
    $("#spesa-pulisci").disabled = !fatte;

    const gruppi = new Map();
    voci.slice()
      .sort((a, b) => (a.spuntata - b.spuntata) || (a.ordine - b.ordine) || a.nome.localeCompare(b.nome, "it"))
      .forEach((v) => {
        const k = v.categoria || "Altro";
        if (!gruppi.has(k)) gruppi.set(k, []);
        gruppi.get(k).push(v);
      });
    const ordine = [...gruppi.keys()].sort((a, b) => {
      const ia = CATEGORIE.indexOf(a), ib = CATEGORIE.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, "it");
    });
    $("#spesa-elenco").innerHTML = voci.length ? ordine.map((k) => `
      <h2 class="occhiello">${esc(k)}</h2>
      <ul class="spesa">
        ${gruppi.get(k).map((v) => `<li class="spesa-voce ${v.spuntata ? "presa" : ""}">
          <label><input type="checkbox" data-spunta="${v.id}" ${v.spuntata ? "checked" : ""}>
            <span>${esc(v.nome)}${v.quantita ? ` <small>${esc(v.quantita)}</small>` : ""}</span></label>
          <button type="button" class="tondo piccolo" data-modifica="${v.id}" aria-label="Modifica ${esc(v.nome)}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19h4L19 9l-4-4L5 15z"/></svg></button>
        </li>`).join("")}
      </ul>`).join("")
      : `<div class="vuoto piccolo"><p class="segnaposto">Lista vuota. Scrivi qui sopra cosa comprare, oppure genera la lista dal piano settimanale.</p></div>`;
  }

  async function aggiungiVeloce(testo) {
    // "yogurt greco, 4 vasetti" → nome + quantità
    const [nome, ...resto] = testo.split(",");
    if (!nome.trim()) return;
    await D.dati((c) => c.from("spesa_voci").insert({ settimana, nome: nome.trim(), quantita: resto.join(",").trim() || null, ordine: voci.length }));
    await carica();
  }

  async function spunta(id, si) {
    const v = voci.find((x) => x.id === id);
    if (v) v.spuntata = si;
    disegna();
    await D.dati((c) => c.from("spesa_voci").update({ spuntata: si }).eq("id", id));
  }

  async function modifica(v) {
    await D.foglio({
      titolo: v ? "Modifica" : "Aggiungi alla spesa", elimina: v ? true : false,
      html: `${D.campo("Cosa", "nome", v?.nome || "", { richiesto: true, attrs: v ? "" : "autofocus" })}
        <div class="griglia-2">
          ${D.campo("Quantità", "quantita", v?.quantita || "", { segnaposto: "es. 500 g" })}
          <label class="campo"><span>Reparto</span><input name="categoria" list="spesa-categorie" value="${esc(v?.categoria || "")}" placeholder="es. Dispensa"></label>
        </div>
        <datalist id="spesa-categorie">${CATEGORIE.map((c) => `<option value="${esc(c)}">`).join("")}</datalist>`,
      async salva(d, form, tipo) {
        if (tipo === "elimina") await D.dati((c) => c.from("spesa_voci").delete().eq("id", v.id));
        else {
          if (!d.nome.trim()) return "Scrivi cosa comprare.";
          const campi = { nome: d.nome.trim(), quantita: d.quantita.trim() || null, categoria: d.categoria.trim() || null };
          if (v) await D.dati((c) => c.from("spesa_voci").update(campi).eq("id", v.id));
          else await D.dati((c) => c.from("spesa_voci").insert({ settimana, ordine: voci.length, ...campi }));
        }
        await carica();
        return undefined;
      },
    });
  }

  function grammiLeggibili(g) {
    if (g >= 1000) return `${fmt(Math.round(g / 100) / 10, 1)} kg`;
    return `${fmt(Math.max(10, Math.round(g / 10) * 10), 0)} g`;
  }

  // Grammi di ogni alimento nel piano della settimana.
  function fabbisognoSettimana() {
    const tot = new Map();
    const aggiungi = (id, g) => tot.set(id, (tot.get(id) || 0) + Number(g));
    D.cache.pianoPasti.forEach((pp) => {
      if (pp.solo_allenamento && !D.allenamentoAbituale(pp.giorno_settimana)) return;
      D.vociDi(pp.id).forEach((v) => {
        if (v.alimento_id) { aggiungi(v.alimento_id, v.grammi); return; }
        const r = D.ricetta(v.ricetta_id);
        if (!r) return;
        const f = Number(v.porzioni) / Number(r.porzioni);
        D.cache.ingredienti.filter((i) => i.ricetta_id === r.id).forEach((i) => aggiungi(i.alimento_id, i.grammi * f));
      });
    });
    return tot;
  }

  async function generaDalPiano() {
    const tot = fabbisognoSettimana();
    if (!tot.size) { D.avviso("Il piano settimanale è vuoto: riempilo in Cucina → Piano.", "errore"); return; }
    const nuove = [], aggiornate = [];
    [...tot.entries()].forEach(([id, g]) => {
      const a = D.alimento(id);
      if (!a) return;
      const quantita = grammiLeggibili(g) + (a.porzione_g && a.porzione_nome ? ` (≈ ${fmt(g / a.porzione_g, 1)} × ${a.porzione_nome})` : "");
      const esiste = voci.find((v) => v.alimento_id === id);
      if (!esiste) nuove.push({ settimana, nome: a.nome, quantita, categoria: "Dal piano", alimento_id: id });
      else if (!esiste.spuntata && esiste.quantita !== quantita) aggiornate.push({ id: esiste.id, quantita });
    });
    if (!nuove.length && !aggiornate.length) { D.avviso("La lista è già allineata al piano."); return; }
    const esito = await D.foglio({
      titolo: "Genera dal piano", conferma: "Aggiungi",
      html: `<p class="sottotitolo-foglio">Dal piano della settimana: <b>${nuove.length}</b> ${nuove.length === 1 ? "voce nuova" : "voci nuove"}${aggiornate.length ? `, <b>${aggiornate.length}</b> quantità da aggiornare` : ""}.</p>
        <ul class="elenco-semplice">${nuove.slice(0, 40).map((n) => `<li>${esc(n.nome)} <small>${esc(n.quantita)}</small></li>`).join("")}</ul>
        <p class="segnaposto piccolo">Le quantità sono a crudo e tengono conto delle porzioni delle ricette. Il pre-allenamento conta solo nei giorni di allenamento abituali.</p>`,
    });
    if (esito !== "ok") return;
    nuove.forEach((n, i) => { n.ordine = voci.length + i; });
    if (nuove.length) await D.dati((c) => c.from("spesa_voci").insert(nuove));
    await Promise.all(aggiornate.map((u) => D.dati((c) => c.from("spesa_voci").update({ quantita: u.quantita }).eq("id", u.id))));
    await carica();
    D.avviso("Lista aggiornata");
  }

  async function pulisci() {
    const esito = await D.foglio({ titolo: "Togli le spuntate", conferma: "Togli", html: `<p class="sottotitolo-foglio">Le voci già prese spariscono dalla lista di questa settimana.</p>` });
    if (esito !== "ok") return;
    await D.dati((c) => c.from("spesa_voci").delete().eq("settimana", settimana).eq("spuntata", true));
    await carica();
  }

  const sez = $("#sezione-spesa");
  sez.addEventListener("click", (e) => {
    const t = e.target.closest("[data-settimana],[data-modifica],[data-azione]");
    if (!t) return;
    if (t.dataset.settimana) {
      const n = Number(t.dataset.settimana);
      settimana = n === 0 ? D.lunediDi(D.oggiIso()) : D.piuGiorni(settimana, 7 * n);
      D.azione(carica);
      return;
    }
    if (t.dataset.modifica) { D.azione(() => modifica(voci.find((v) => v.id === t.dataset.modifica))); return; }
    const azioni = { aggiungi: () => modifica(null), genera: generaDalPiano, pulisci };
    if (azioni[t.dataset.azione]) D.azione(azioni[t.dataset.azione]);
  });
  sez.addEventListener("change", (e) => {
    if (e.target.matches("[data-spunta]")) D.azione(() => spunta(e.target.dataset.spunta, e.target.checked));
  });
  $("#spesa-veloce").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = e.target.elements.voce;
    const testo = input.value;
    input.value = "";
    D.azione(() => aggiungiVeloce(testo));
  });

  D.sezione("spesa", { carica });
})();
