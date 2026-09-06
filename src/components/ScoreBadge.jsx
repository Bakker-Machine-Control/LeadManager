// Compacte scorebadge: het getal en het label.
// Heet = rood, Warm = oranje, Lauw = geel, Koud = grijs.
// Nog geen score (niet verrijkt of onvoldoende gegevens) → geen badge.
const STIJLEN = {
  Heet: 'bg-red-500/15 text-red-600',
  Warm: 'bg-orange-500/15 text-orange-600',
  Lauw: 'bg-yellow-500/20 text-yellow-700',
  Koud: 'bg-muted text-muted-foreground',
};

export default function ScoreBadge({ score, score_label }) {
  if (score == null || !score_label || !STIJLEN[score_label]) return null;

  return (
    <span className={`text-[10px] font-semibold rounded-full px-1.5 py-0.5 whitespace-nowrap shrink-0 ${STIJLEN[score_label]}`}>
      {score} · {score_label}
    </span>
  );
}