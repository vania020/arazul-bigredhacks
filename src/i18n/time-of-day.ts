import type { Lang } from "@/i18n";
interface Copy {
  title: string;
  names: string[];
  note: string;
  choose: string;
  allDay: string;
  unavailable: string;
  unsupported: string;
  outside: string;
  index: string;
  current: string;
  difference: string;
  equal: string;
  bars: string;
  local: string;
}
export const timeOfDayCopy: Record<Lang, Copy> = {
  en: {
    title: "Compare time of day",
    names: ["Late night", "Morning", "Afternoon", "Evening"],
    note: "Historical reported-incident index for the same route, not a crime prediction. Every hour within each six-hour window has the same model score.",
    choose: "Choose a route to compare its historical index across these windows.",
    allDay:
      "This monthly source has no time-of-day data. A comparison between departure windows is unavailable.",
    unavailable: "Time-of-day incident data is unavailable for this area.",
    unsupported: "Time-of-day comparison is unavailable for this travel mode.",
    outside:
      "This route extends outside the incident data coverage. Time-of-day comparison is unavailable.",
    index: "Index",
    current: "Selected window",
    difference: "index points vs. selected window",
    equal: "No difference at displayed precision",
    bars: "Bars use unrounded scores relative to the highest of these four windows. Indexes and differences in index points are rounded to two decimals.",
    local: "Local time",
  },
  pt: {
    title: "Comparar períodos do dia",
    names: ["Madrugada", "Manhã", "Tarde", "Noite"],
    note: "Índice histórico de ocorrências registradas para a mesma rota, não uma previsão de crimes. Todas as horas de cada período de seis horas têm a mesma pontuação no modelo.",
    choose: "Escolha uma rota para comparar seu índice histórico nestes períodos.",
    allDay:
      "Esta fonte mensal não tem dados por horário. A comparação entre períodos de partida está indisponível.",
    unavailable: "Dados de ocorrências por horário indisponíveis nesta região.",
    unsupported: "Comparação por horário indisponível para este modo de transporte.",
    outside: "Esta rota passa fora da cobertura dos dados. Comparação por horário indisponível.",
    index: "Índice",
    current: "Período selecionado",
    difference: "pontos de índice em relação ao período selecionado",
    equal: "Sem diferença na precisão exibida",
    bars: "As barras usam valores não arredondados, relativos ao maior destes quatro períodos. Índices e diferenças em pontos de índice são arredondados a duas casas decimais.",
    local: "Horário local",
  },
  es: {
    title: "Comparar horas del día",
    names: ["Madrugada", "Mañana", "Tarde", "Noche"],
    note: "Índice histórico de incidentes registrados para la misma ruta, no una predicción de delitos. Todas las horas de cada período de seis horas tienen la misma puntuación en el modelo.",
    choose: "Elige una ruta para comparar su índice histórico en estos períodos.",
    allDay:
      "Esta fuente mensual no tiene datos por hora del día. La comparación entre períodos de salida no está disponible.",
    unavailable: "No hay datos de incidentes por hora del día para esta zona.",
    unsupported: "La comparación por hora no está disponible para este modo de transporte.",
    outside:
      "Esta ruta sale de la cobertura de los datos. La comparación por hora no está disponible.",
    index: "Índice",
    current: "Período seleccionado",
    difference: "puntos de índice frente al período seleccionado",
    equal: "Sin diferencia con la precisión mostrada",
    bars: "Las barras usan valores sin redondear, relativos al mayor de estos cuatro períodos. Los índices y las diferencias en puntos de índice se redondean a dos decimales.",
    local: "Hora local",
  },
};
