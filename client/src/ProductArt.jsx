const GLYPHS = {
  'KB-K68': (
    <>
      <rect x="54" y="62" width="212" height="74" rx="9" />
      <rect x="66" y="74" width="188" height="50" rx="4" opacity="0.55" />
      <path d="M78 88h16M102 88h16M126 88h16M150 88h16M174 88h16M198 88h16M222 88h16" />
      <path d="M78 102h16M102 102h16M126 102h16M150 102h16M174 102h16M198 102h16M222 102h16" />
      <path d="M92 114h136" />
      <path d="M266 96c18 4 22 16 22 30" opacity="0.65" />
    </>
  ),
  'MP-WOOL': (
    <>
      <rect x="48" y="48" width="224" height="96" rx="12" />
      <rect x="61" y="61" width="198" height="70" rx="9" opacity="0.45" />
      <path d="M138 80c0-9 7-15 15-15h14c8 0 15 6 15 15v22c0 9-7 15-15 15h-14c-8 0-15-6-15-15z" />
      <path d="M182 77c13 2 20 9 20 20s-7 18-20 20" opacity="0.65" />
      <path d="M120 128c0-8 6-14 14-14h52" opacity="0.5" />
    </>
  ),
  'LMP-DESK': (
    <>
      <ellipse cx="132" cy="142" rx="51" ry="10" />
      <path d="M132 142V94l42-38" />
      <path d="M174 56l42 18-14 34-42-18z" />
      <path d="M216 82c3 20-7 31-25 35" opacity="0.55" />
      <path d="M236 120l6 6M250 112l8 4M248 132l8 2" opacity="0.5" />
    </>
  ),
  'MA-DUAL': (
    <>
      <rect x="40" y="48" width="112" height="70" rx="6" />
      <rect x="168" y="48" width="112" height="70" rx="6" />
      <path d="M64 142h64M80 118v24M208 142h64M224 118v24" />
      <path d="M156 84h12" />
      <path d="M160 118v20h-32M160 138h32" opacity="0.65" />
      <rect x="50" y="58" width="92" height="50" rx="3" opacity="0.45" />
      <rect x="178" y="58" width="92" height="50" rx="3" opacity="0.45" />
    </>
  ),
  'HUB-7IN1': (
    <>
      <rect x="64" y="68" width="178" height="44" rx="10" />
      <path d="M82 90v-9M96 90v-9M110 90v-9" />
      <rect x="132" y="81" width="24" height="12" rx="2" />
      <rect x="166" y="82" width="14" height="10" rx="2" />
      <rect x="190" y="82" width="20" height="10" rx="2" />
      <path d="M242 90h20c10 0 18 8 18 18v18" />
      <path d="M280 126l-8-9M280 126l8-9" opacity="0.55" />
    </>
  ),
  'SLV-14': (
    <>
      <rect x="54" y="42" width="212" height="96" rx="12" />
      <path d="M54 112h212" opacity="0.45" />
      <path d="M96 42V29c0-8 7-15 15-15h98c8 0 15 7 15 15v13" />
      <path d="M64 120h192" />
      <path d="M212 120l12 8-12 8" />
      <rect x="76" y="60" width="44" height="7" rx="3.5" opacity="0.6" />
    </>
  ),
  'CAM-1080': (
    <>
      <rect x="76" y="62" width="168" height="68" rx="24" />
      <circle cx="134" cy="96" r="24" />
      <circle cx="134" cy="96" r="11" opacity="0.55" />
      <rect x="176" y="84" width="18" height="6" rx="3" opacity="0.6" />
      <rect x="176" y="102" width="18" height="6" rx="3" opacity="0.6" />
      <path d="M76 114c-4 12 4 22 16 22M244 114c4 12-4 22-16 22" />
      <path d="M140 130v14M180 130v14M120 144h80" />
    </>
  ),
  'CT-UD': (
    <>
      <path d="M44 72h232" />
      <path d="M54 72l14 66h188l14-66" />
      <path d="M68 96h184" opacity="0.55" />
      <path d="M98 72c0 24 18 26 45 26s42 6 42 22-14 24-38 24-42-8-42-24" opacity="0.55" />
      <path d="M170 72c10 0 18 8 18 18v40" opacity="0.55" />
      <circle cx="92" cy="138" r="5" opacity="0.6" />
      <circle cx="228" cy="138" r="5" opacity="0.6" />
    </>
  ),
};

const FALLBACK = (
  <>
    <rect x="64" y="56" width="192" height="70" rx="10" />
    <path d="M96 96h128M96 112h80" opacity="0.55" />
  </>
);

export function ProductGlyph({ sku }) {
  return (
    <svg viewBox="0 0 320 180" role="presentation" focusable="false">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {GLYPHS[sku] || FALLBACK}
      </g>
    </svg>
  );
}

export default function ProductArt({
  sku,
  tone = 'slate',
  label,
  large = false,
  compact = false,
}) {
  if (compact) {
    return (
      <div className={`cart-thumb tone-${tone}`} aria-hidden="true">
        <ProductGlyph sku={sku} />
      </div>
    );
  }

  return (
    <div
      className={`product-art tone-${tone}${large ? ' product-art-large' : ''}`}
      aria-hidden="true"
    >
      <ProductGlyph sku={sku} />
      {label && <span>{label}</span>}
    </div>
  );
}
