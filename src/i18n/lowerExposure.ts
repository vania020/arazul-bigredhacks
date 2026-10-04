const en = {
  title: "Lower-exposure option",
  vsFastest: "+{min} min vs fastest",
  beyond: "{over} min beyond your current +{budget} min limit",
  tradeoff:
    "Your current route respects your time preference. This one has lower reported exposure if you're willing to spend more time.",
  use: "Use this route (allow +{min} min)",
  more: "See more lower-exposure options ({n})",
};
export type LowerExposureCopy = typeof en;

const pt: LowerExposureCopy = {
  title: "Opção com menor exposição",
  vsFastest: "+{min} min em relação à mais rápida",
  beyond: "{over} min além do seu limite atual de +{budget} min",
  tradeoff:
    "Sua rota atual respeita sua preferência de tempo. Esta tem menor exposição registrada se você aceitar levar mais tempo.",
  use: "Usar esta rota (permitir +{min} min)",
  more: "Ver mais opções com menor exposição ({n})",
};

const es: LowerExposureCopy = {
  title: "Opción con menor exposición",
  vsFastest: "+{min} min frente a la más rápida",
  beyond: "{over} min por encima de tu límite actual de +{budget} min",
  tradeoff:
    "Tu ruta actual respeta tu preferencia de tiempo. Esta tiene menor exposición reportada si aceptas tardar más.",
  use: "Usar esta ruta (permitir +{min} min)",
  more: "Ver más opciones con menor exposición ({n})",
};

export const lowerExposureCopy = { en, pt, es };
