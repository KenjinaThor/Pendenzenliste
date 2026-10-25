const PIECES = ['🎉', '✨', '⭐', '🎊', '💫', '🍀'];

/** Kleiner Konfetti-Regen (rein dekorativ; bei «Bewegung reduzieren» per CSS ausgeblendet). */
export function Confetti() {
  return (
    <div aria-hidden className="confetti pointer-events-none fixed inset-0 z-30 overflow-hidden">
      {Array.from({ length: 22 }, (_, i) => (
        <span
          key={i}
          className="confetti-piece absolute top-0 text-2xl"
          style={{
            left: `${(i * 37) % 100}%`,
            animationDelay: `${(i % 7) * 0.12}s`,
            animationDuration: `${1.8 + (i % 5) * 0.3}s`,
          }}
        >
          {PIECES[i % PIECES.length]}
        </span>
      ))}
    </div>
  );
}
