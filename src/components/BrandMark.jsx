/**
 * GigPay brand mark (Verified Payout Seal) and wordmark lockup.
 * Renders crisp inline SVG at any scale without raster blur.
 */
export const BrandMark = ({ size = 32, variant = 'auto', className = '' }) => {
  const isDarkTile = variant === 'dark';
  const isLightTile = variant === 'light';
  const tileClass = isDarkTile
    ? 'gp-brand-mark gp-brand-mark--dark'
    : isLightTile
      ? 'gp-brand-mark gp-brand-mark--light'
      : 'gp-brand-mark';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${tileClass}${className ? ` ${className}` : ''}`}
      aria-hidden="true"
    >
      <rect className="gp-brand-tile" width="64" height="64" rx="16" />
      <path
        className="gp-brand-ring"
        d="M47.8 34.4C46.6 42.1 40.0 48 32 48C23.2 48 16 40.8 16 32C16 23.2 23.2 16 32 16C35.1 16 38.0 16.9 40.5 18.4"
        strokeWidth="5.8"
        strokeLinecap="round"
      />
      <path
        className="gp-brand-check"
        d="M25.5 32.5L30.5 37.5L47.2 19.8"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export const BrandLockup = ({ size = 30, variant = 'auto', className = '' }) => {
  const variantClass =
    variant === 'light'
      ? ' gp-brand-lockup--light'
      : variant === 'dark'
        ? ' gp-brand-lockup--dark'
        : '';

  return (
    <span className={`gp-brand-lockup${variantClass}${className ? ` ${className}` : ''}`}>
      <BrandMark size={size} variant={variant} />
      <span className="gp-brand-wordmark">GigPay</span>
    </span>
  );
};

export default BrandMark;
