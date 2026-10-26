/* =====================================================================
   Dieta — Impostazioni
   Obiettivi giornalieri, giorni di allenamento, copia dei dati, account.
   ===================================================================== */
(function () {
  "use strict";
  const D = window.Dieta;
  const { $, $$, fmt } = D;

  async function carica() {
    await D.ricarica("imp");
    disegna();
  }

  function disegna() {
    const imp = D.cache.imp;
    const form = $("#form-obiettivi");
    if (!imp) { form.innerHTML = `<p class="segnaposto">Impostazioni non trovate.</p>`; return; }
    form.innerHTML = `
      <div class="griglia-2">
        ${D.campo("Calorie (kcal)", "kcal_obiettivo", imp.kcal_obiettivo, { intero: true, richiesto: true })}
        ${D.campo("Proteine (g)", "proteine_obiettivo_g", D.perCampo(imp.proteine_obiettivo_g), { decimale: true, richiesto: true })}
        ${D.campo("Carboidrati (g)", "carboidrati_obiettivo_g", D.perCampo(imp.carboidrati_obiettivo_g), { decimale: true, richiesto: true })}
        ${D.campo("Grassi (g)", "grassi_obiettivo_g", D.perCampo(imp.grassi_obiettivo_g), { decimale: true, richiesto: true })}
      </div>
      <p class="segnaposto piccolo" id="stima-obiettivi"></p>
      <div class="griglia-2">
        ${D.campo("Acqua (bicchieri)", "acqua_obiettivo_bicchieri", imp.acqua_obiettivo_bicchieri, { intero: true, richiesto: true })}
        ${D.campo("Un bicchiere (ml)", "bicchiere_ml", imp.bicchiere_ml, { intero: true, richiesto: true })}
        ${D.campo("Passi al giorno", "passi_obiettivo", imp.passi_obiettivo ?? "", { intero: true })}
      </div>
      <p class="campo-titolo">Giorni di allenamento abituali</p>
      <div class="chips giorni">${D.GIORNI_BREVI.map((g, i) => `<label class="chip-spunta"><input type="checkbox" name="giorni" value="${i + 1}" ${imp.giorni_allenamento.includes(i + 1) ? "checked" : ""}><span>${g}</span></label>`).join("")}</div>
      <p class="segnaposto piccolo">Nei giorni di allenamento compare il pre-allenamento. Puoi cambiare un singolo giorno da Oggi.</p>
      <p class="errore" id="obiettivi-errore" role="alert" hidden></p>
      <button type="submit" class="bottone primario largo">Salva gli obiettivi</button>`;
    stima();
  }

  function stima() {
    const f = $("#form-obiettivi");
    if (!f.elements.kcal_obiettivo) return;
    const p = D.num(f.elements.proteine_obiettivo_g.value) || 0;
    const c = D.num(f.elements.carboidrati_obiettivo_g.value) || 0;
    const g = D.num(f.elements.grassi_obiettivo_g.value) || 0;
    $("#stima-obiettivi").textContent = `Dai macro: circa ${fmt(p * 4 + c * 4 + g * 9, 0)} kcal (proteine e carboidrati 4 kcal/g, grassi 9).`;
  }

  async function salva(form) {
    const err = $("#obiettivi-errore");
    err.hidden = true;
    const e = form.elements;
    const n = (k) => D.num(e[k].value);
    const campi = {
      kcal_obiettivo: n("kcal_obiettivo"),
      proteine_obiettivo_g: n("proteine_obiettivo_g"),
      carboidrati_obiettivo_g: n("carboidrati_obiettivo_g"),
      grassi_obiettivo_g: n("grassi_obiettivo_g"),
      acqua_obiettivo_bicchieri: n("acqua_obiettivo_bicchieri"),
      bicchiere_ml: n("bicchiere_ml"),
      passi_obiettivo: n("passi_obiettivo"),
      giorni_allenamento: $$("input[name=giorni]:checked", form).map((i) => Number(i.value)),
    };
    const problema =
      campi.kcal_obiettivo === null || campi.kcal_obiettivo < 500 || campi.kcal_obiettivo > 6000 || !Number.isInteger(campi.kcal_obiettivo) ? "Le calorie devono essere un numero intero tra 500 e 6000."
        : ["proteine_obiettivo_g", "carboidrati_obiettivo_g", "grassi_obiettivo_g"].some((k) => campi[k] === null || campi[k] < 0) ? "Scrivi i grammi di proteine, carboidrati e grassi."
          : campi.acqua_obiettivo_bicchieri === null || campi.acqua_obiettivo_bicchieri < 1 || campi.acqua_obiettivo_bicchieri > 40 ? "I bicchieri d'acqua vanno da 1 a 40."
            : campi.bicchiere_ml === null || campi.bicchiere_ml < 50 || campi.bicchiere_ml > 1000 ? "Un bicchiere va da 50 a 1000 ml."
              : campi.passi_obiettivo !== null && campi.passi_obiettivo < 0 ? "I passi non possono essere negativi."
                : null;
    if (problema) { err.textContent = problema; err.hidden = false; return; }
    const bottone = $("button[type=submit]", form);
    bottone.disabled = true;
    try {
      await D.dati((c) => c.from("impostazioni").update(campi).eq("user_id", D.utente.id));
      await D.ricarica("imp");
      D.avviso("Obiettivi salvati");
    } finally {
      bottone.disabled = false;
    }
  }

  // Copia di tutti i dati in un file JSON (da tenere come backup).
  async function esporta() {
    const tabelle = ["impostazioni", "alimenti", "ricette", "ricetta_ingredienti", "bevande", "piano_pasti", "piano_voci",
      "giornate", "scambi_pasto", "diario", "peso", "punto_vita", "acqua", "passi", "spesa_voci"];
    const copia = { esportato: new Date().toISOString(), tabelle: {} };
    for (const t of tabelle) {
      const righe = [];
      for (let da = 0; ; da += 1000) {
        const pagina = await D.dati((c) => c.from(t).select("*").range(da, da + 999));
        righe.push(...pagina);
        if (pagina.length < 1000) break;
      }
      copia.tabelle[t] = righe;
    }
    const blob = new Blob([JSON.stringify(copia, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `dieta-${D.oggiIso()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    D.avviso("File scaricato");
  }

  const form = $("#form-obiettivi");
  form.addEventListener("submit", (e) => { e.preventDefault(); D.azione(() => salva(form)); });
  form.addEventListener("input", stima);
  $("#esporta").addEventListener("click", () => D.azione(esporta));

  D.sezione("impostazioni", { carica });
})();
