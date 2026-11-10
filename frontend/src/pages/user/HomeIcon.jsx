export default function HomeIcon({ name, size = 22 }) {
  const paths = {
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5" />
      </>
    ),
    pin: (
      <>
        <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    scissors: (
      <>
        <circle cx="6" cy="6" r="3" />
        <circle cx="6" cy="18" r="3" />
        <path d="m8 8 12 12M8 16 20 4M14 10l-3 3" />
      </>
    ),
    beard: (
      <>
        <path d="M5 5v7c0 5 7 9 7 9s7-4 7-9V5M5 12l4 3 3-2 3 2 4-3" />
        <path d="M9 8h.01M15 8h.01" />
      </>
    ),
    comb: (
      <>
        <path d="m4 20 5-5M7 13 17 3l4 4L11 17ZM11 9l4 4M14 6l4 4" />
      </>
    ),
    color: (
      <>
        <path d="M12 2C9 7 5 10 5 15a7 7 0 0 0 14 0c0-5-4-8-7-13Z" />
        <path d="M9 16a3 3 0 0 0 3 3" />
      </>
    ),
    star: (
      <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z" />
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
    arrow: <path d="M4 12h16m-5-5 5 5-5 5" />,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
