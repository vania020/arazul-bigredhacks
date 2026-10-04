/** NYC-native source disclosure shown in the methodology modal. */
export const datasetDetailsCopy = {
  en: {
    title: "Historical reported outdoor-complaint exposure",
    intro:
      "NYC routes are compared by historical reported outdoor-complaint exposure. A lower score means lower modeled exposure to these selected published NYPD complaints. It is not a probability of harm, a crime rate or a count of all crime.",
    model: "Model",
    window: "Occurrence window",
    windowValue: "{period} (fixed; not live data)",
    releases: "Release coverage",
    releaseValue: "{id}: reports through {date}",
    retrieved: "Retrieved {date}",
    complaints: "Complaints used",
    complaintsValue:
      "{eligible} eligible of {merged} merged source rows ({excluded} excluded). Counts are complaints, not victims or every offense in a multi-offense event.",
    categories: "Selected NYPD categories (equal weight each)",
    largeny: "selected from-person PD codes only: {codes}",
    premises: "Premises",
    time: "Unknown times",
    timeValue:
      "{n} complaints with missing, incomplete or multi-window occurrence times were excluded. No hour was assigned.",
    driving: "Driving",
    drivingValue: "Unsupported. Only walking routes receive NYC exposure scores.",
  },
  pt: {
    title: "Exposição histórica a queixas registradas em via pública",
    intro:
      "Em NYC, as rotas são comparadas pela exposição histórica a queixas registradas em via pública. Uma pontuação menor indica menor exposição modelada a estas queixas selecionadas publicadas pelo NYPD. Não é uma probabilidade de dano, uma taxa de criminalidade nem uma contagem de todos os crimes.",
    model: "Modelo",
    window: "Período de ocorrência",
    windowValue: "{period} (fixo; não são dados ao vivo)",
    releases: "Cobertura das publicações",
    releaseValue: "{id}: registros até {date}",
    retrieved: "Obtido em {date}",
    complaints: "Queixas usadas",
    complaintsValue:
      "{eligible} elegíveis de {merged} linhas de origem combinadas ({excluded} excluídas). As contagens são queixas, não vítimas nem cada delito de um evento com vários delitos.",
    categories: "Categorias do NYPD selecionadas (mesmo peso)",
    largeny: "apenas códigos PD selecionados de furto contra a pessoa: {codes}",
    premises: "Locais",
    time: "Horários desconhecidos",
    timeValue:
      "{n} queixas com horário ausente, incompleto ou que abrange mais de uma janela foram excluídas. Nenhum horário foi atribuído.",
    driving: "Carro",
    drivingValue: "Não suportado. Só rotas a pé recebem pontuação de exposição em NYC.",
  },
  es: {
    title: "Exposición histórica a denuncias registradas en la vía pública",
    intro:
      "En NYC, las rutas se comparan por la exposición histórica a denuncias registradas en la vía pública. Una puntuación menor indica menor exposición modelada a estas denuncias seleccionadas publicadas por el NYPD. No es una probabilidad de daño, una tasa de criminalidad ni un recuento de todos los delitos.",
    model: "Modelo",
    window: "Periodo de ocurrencia",
    windowValue: "{period} (fijo; no son datos en vivo)",
    releases: "Cobertura de las publicaciones",
    releaseValue: "{id}: denuncias hasta {date}",
    retrieved: "Obtenido el {date}",
    complaints: "Denuncias usadas",
    complaintsValue:
      "{eligible} elegibles de {merged} filas de origen combinadas ({excluded} excluidas). Los recuentos son denuncias, no víctimas ni cada delito de un evento con varios delitos.",
    categories: "Categorías del NYPD seleccionadas (mismo peso)",
    largeny: "solo códigos PD seleccionados de hurto a la persona: {codes}",
    premises: "Lugares",
    time: "Horas desconocidas",
    timeValue:
      "Se excluyeron {n} denuncias con hora ausente, incompleta o que abarca más de una franja. No se asignó ninguna hora.",
    driving: "Auto",
    drivingValue: "No disponible. Solo las rutas a pie reciben puntuación de exposición en NYC.",
  },
};
