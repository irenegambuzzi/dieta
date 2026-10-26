/* =====================================================================
   Dieta — Peso
   Pesata del mattino (una al giorno), medie settimanali con grafico,
   punto vita. Tutto modificabile toccando la riga.
   ===================================================================== */
(function () {
  "use strict";
  const D = window.Dieta;
  const { $, esc, fmt } = D;

  let pesi = [];        // dal più recente
  let settimane = [];   // dalla più recente
  let vita = [];

  async function carica() {
    [pesi, settimane, vita] = await Promise.all([
      D.dati((c) => c.from("peso").select("*").order("data", { ascending: false }).limit(400)),
      D.dati((c) => c.from("peso_settimanale").select("*").order("settimana", { ascending: false }).limit(52)),
      D.dati((c) => c.from("punto_vita").select("*").order("data", { ascending: false }).limit(100)),
    ]);
    disegna();
  }

  const segno = (n) => (n > 0 ? "+" : n < 0 ? "−" : "±") + fmt(Math.abs(n), 2);

  function disegna() {
    const oggi = D.oggiIso();
    const s0 = settimane[0];
    if (s0) {
      const corrente = s0.settimana === D.lunediDi(oggi);
      $("#peso-sopra").textContent = corrente ? "Media di questa settimana" : `Media della settimana del ${D.dataBreve(s0.settimana)}`;
      $("#peso-media").innerHTML = `${fmt(s0.media_kg, 2)} <small>kg</small>`;
      const s1 = settimane[1];
      $("#peso-delta").textContent = s1
        ? `${segno(s0.media_kg - s1.media_kg)} kg rispetto alla settimana prima · ${s0.misure} ${s0.misure === 1 ? "pesata" : "pesate"}`
        : `${s0.misure} ${s0.misure === 1 ? "pesata" : "pesate"} questa settimana`;
    } else {
      $("#peso-sopra").textContent = "Media settimanale";
      $("#peso-media").innerHTML = `— <small>kg</small>`;
      $("#peso-delta").textContent = "Pesati al mattino, a digiuno: la media della settimana conta più del singolo giorno.";
    }
    const pesataOggi = pesi.find((p) => p.data === oggi);
    $("#peso-oggi").textContent = pesataOggi ? `Oggi: ${fmt(pesataOggi.kg, 2)} kg · modifica` : "Pesata di oggi";

    $("#peso-grafico").innerHTML = grafico();

    $("#peso-settimane").innerHTML = settimane.length
      ? settimane.slice(0, 12).map((s, i) => {
        const prima = settimane[i + 1];
        const delta = prima ? s.media_kg - prima.media_kg : null;
        return `<div><dt>Sett. del ${D.dataBreve(s.settimana)} <small>${s.misure}×</small></dt>
          <dd>${fmt(s.media_kg, 2)} kg${delta !== null ? ` <small class="${delta <= 0 ? "giu" : "su"}">${segno(delta)}</small>` : ""}</dd></div>`;
      }).join("")
      : `<div><dt>Ancora nessuna pesata</dt><dd></dd></div>`;

    $("#peso-elenco").innerHTML = pesi.slice(0, 60).map((p) => `<li><button type="button" class="voce" data-peso="${p.id}">
        <span class="voce-nome">${esc(D.dataLunga(p.data))}${p.nota ? ` <small>${esc(p.nota)}</small>` : ""}</span>
        <span class="voce-kcal">${fmt(p.kg, 2)} kg</span></button></li>`).join("")
      || `<li class="segnaposto">Le pesate appariranno qui.</li>`;

    const v0 = vita[0];
    $("#vita-ultimo").innerHTML = v0
      ? `${fmt(v0.cm)} <small>cm · ${esc(D.dataBreve(v0.data))}${vita[1] ? ` · ${segno(v0.cm - vita[1].cm)} cm` : ""}</small>`
      : `— <small>cm</small>`;
    $("#vita-elenco").innerHTML = vita.slice(0, 20).map((v) => `<li><button type="button" class="voce" data-vita="${v.id}">
        <span class="voce-nome">${esc(D.dataLunga(v.data))}${v.nota ? ` <small>${esc(v.nota)}</small>` : ""}</span>
        <span class="voce-kcal">${fmt(v.cm)} cm</span></button></li>`).join("");
  }

  // Grafico: pesate giornaliere (punti) e media settimanale (linea), ultime 16 settimane.
  function grafico() {
    // da 4 a 16 settimane: parte dalla settimana della prima pesata disponibile
    const lunOggi = D.lunediDi(D.oggiIso());
    const limite = D.piuGiorni(lunOggi, -7 * 15);
    const primo = pesi.filter((p) => p.data >= limite).map((p) => p.data).pop();
    const da = primo ? [D.lunediDi(primo), D.piuGiorni(lunOggi, -7 * 3)].sort()[0] : limite;
    const settimaneTot = Math.round((D.daIso(lunOggi) - D.daIso(da)) / (7 * 864e5)) + 1;
    const punti = pesi.filter((p) => p.data >= da).reverse();
    const medie = settimane.filter((s) => s.settimana >= da).reverse();
    if (punti.length < 2) return `<p class="segnaposto piccolo">Il grafico compare dalla seconda pesata.</p>`;

    const W = 320, H = 150, sx = 8, dx = 36, su = 10, giu = 22;
    const valori = punti.map((p) => Number(p.kg));
    let min = Math.min(...valori), max = Math.max(...valori);
    if (max - min < 1) { const m = (max + min) / 2; min = m - 0.5; max = m + 0.5; }
    const t0 = D.daIso(da).getTime(), t1 = D.daIso(D.piuGiorni(lunOggi, 6)).getTime();
    const x = (iso) => sx + ((D.daIso(iso).getTime() - t0) / (t1 - t0)) * (W - sx - dx);
    const y = (kg) => su + (1 - (kg - min) / (max - min)) * (H - su - giu);

    const linea = medie.map((s, i) => `${i ? "L" : "M"}${x(D.piuGiorni(s.settimana, 3)).toFixed(1)},${y(s.media_kg).toFixed(1)}`).join(" ");
    const etichette = [max, (max + min) / 2, min].map((v) => `<text x="${W - dx + 6}" y="${(y(v) + 4).toFixed(1)}" class="g-asse">${fmt(v, 1)}</text>
      <line x1="${sx}" x2="${W - dx}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="g-griglia"/>`).join("");
    const mesi = [];
    for (let i = 0; i < settimaneTot; i += Math.max(1, Math.ceil(settimaneTot / 4))) {
      const s = D.piuGiorni(da, i * 7);
      mesi.push(`<text x="${x(s).toFixed(1)}" y="${H - 6}" class="g-asse">${D.dataBreve(s)}</text>`);
    }
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Andamento del peso nelle ultime settimane">
      ${etichette}${mesi.join("")}
      ${punti.map((p) => `<circle cx="${x(p.data).toFixed(1)}" cy="${y(p.kg).toFixed(1)}" r="2.6" class="g-punto"/>`).join("")}
      ${medie.length > 1 ? `<path d="${linea}" class="g-linea"/>` : ""}
      ${medie.map((s) => `<circle cx="${x(D.piuGiorni(s.settimana, 3)).toFixed(1)}" cy="${y(s.media_kg).toFixed(1)}" r="3.6" class="g-media"/>`).join("")}
    </svg>
    <p class="legenda"><span class="l-punto"></span> pesate <span class="l-linea"></span> media settimanale</p>`;
  }

  // Foglio comune per peso e punto vita
  async function modifica(tabella, riga, { titolo, unita, campoValore, min, max }) {
    const nuova = !riga;
    await D.foglio({
      titolo, elimina: !nuova,
      html: `<div class="griglia-2">
          ${D.campo("Data", "data", riga ? riga.data : D.oggiIso(), { tipo: "date", richiesto: true, attrs: `max="${D.oggiIso()}"` })}
          ${D.campo(unita, "valore", riga ? D.perCampo(riga[campoValore]) : "", { decimale: true, richiesto: true, attrs: "autofocus" })}
        </div>
        ${D.campo("Nota (facoltativa)", "nota", riga?.nota || "", { segnaposto: "es. dopo il ciclo, dopo una cena fuori" })}`,
      async salva(d, form, tipo) {
        if (tipo === "elimina") {
          await D.dati((c) => c.from(tabella).delete().eq("id", riga.id));
        } else {
          const v = D.num(d.valore);
          if (v === null || v < min || v > max) return `Scrivi un valore tra ${min} e ${max}.`;
          const valori = { data: d.data, [campoValore]: v, nota: d.nota.trim() || null };
          if (riga && riga.data !== d.data) {
            await D.dati((c) => c.from(tabella).delete().eq("id", riga.id));
          }
          await D.dati((c) => c.from(tabella).upsert(valori, { onConflict: "user_id,data" }));
        }
        await carica();
        return undefined;
      },
    });
  }

  const PESO = { titolo: "Pesata", unita: "Kg", campoValore: "kg", min: 25, max: 300 };
  const VITA = { titolo: "Punto vita", unita: "Centimetri", campoValore: "cm", min: 30, max: 250 };

  $("#sezione-peso").addEventListener("click", (e) => {
    const t = e.target.closest("[data-peso],[data-vita],[data-azione]");
    if (!t) return;
    if (t.dataset.peso) return D.azione(() => modifica("peso", pesi.find((p) => p.id === t.dataset.peso), PESO));
    if (t.dataset.vita) return D.azione(() => modifica("punto_vita", vita.find((v) => v.id === t.dataset.vita), VITA));
    if (t.dataset.azione === "pesa") return D.azione(() => modifica("peso", pesi.find((p) => p.data === D.oggiIso()), PESO));
    if (t.dataset.azione === "vita") return D.azione(() => modifica("punto_vita", null, VITA));
    return undefined;
  });

  D.sezione("peso", { carica });
})();
