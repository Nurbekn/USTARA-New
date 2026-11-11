const paths = {
  cameraUpload: <><path d="M4 7h4l2-3h4l2 3h4v13H4Z" /><circle cx="12" cy="13" r="3" /></>,
  calendar: <><rect x="4" y="5" width="16" height="16" rx="3" /><path d="M8 3v4m8-4v4M4 11h16m-11 5h3" /></>,
  bookmark: <path d="M6 3h12v18l-6-4-6 4Z" />,
  search: <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5" />
      </>,
  pin: <>
        <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>,
  scissors: <>
        <circle cx="6" cy="6" r="3" />
        <circle cx="6" cy="18" r="3" />
        <path d="m8 8 12 12M8 16 20 4M14 10l-3 3" />
      </>,
  beard: <>
        <path d="M5 5v7c0 5 7 9 7 9s7-4 7-9V5M5 12l4 3 3-2 3 2 4-3" />
        <path d="M9 8h.01M15 8h.01" />
      </>,
  comb: <>
        <path d="m4 20 5-5M7 13 17 3l4 4L11 17ZM11 9l4 4M14 6l4 4" />
      </>,
  color: <>
        <path d="M12 2C9 7 5 10 5 15a7 7 0 0 0 14 0c0-5-4-8-7-13Z" />
        <path d="M9 16a3 3 0 0 0 3 3" />
      </>,
  star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  arrow: <path d="M4 12h16m-5-5 5 5-5 5" />,
  heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />,
  comment: <path d="M21 11.5a9 9 0 0 1-9 9 9.7 9.7 0 0 1-4-.9L3 21l1.4-4.7A8.8 8.8 0 0 1 3 11.5a9 9 0 0 1 18 0Z" />,
  send: <><path d="m22 2-7 20-4-9L2 9Z" /><path d="m22 2-11 11" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  socialScissors: <><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="m8 8 12 12M8 16 20 4" /></>,
  external: <><path d="M14 3h7v7M21 3l-9 9" /><path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" /></>,
  follow: <><circle cx="9" cy="7" r="4" /><path d="M2 21v-2a7 7 0 0 1 14 0v2M20 8v6m-3-3h6" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
  socialCalendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 11h18" /></>,
  shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z" /><path d="m8 12 3 3 5-6" /></>,
  award: <><circle cx="12" cy="8" r="5" /><path d="m8 12-2 9 6-3 6 3-2-9" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  person: <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
      </>,
  phone: <>
        <rect x="6" y="2" width="12" height="20" rx="3" />
        <path d="M10 18h4" />
      </>,
  chevronRight: <path d="m9 5 7 7-7 7" />,
  logout: <>
        <path d="M9 4H4v16h5M10 12h11m-4-4 4 4-4 4" />
      </>,
  lock: <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        <path d="M12 14v3" />
      </>,
  camera: <>
        <path d="M8 5 10 2h4l2 3h4v14H4V5Z" />
        <circle cx="12" cy="11" r="3" />
      </>,
  home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v12h5v-7h4v7h5V9" /></>,
  explore: <><circle cx="11" cy="11" r="7" /><path d="m16 16 5 5" /></>,
  bookings: <><rect x="4" y="5" width="16" height="16" rx="3" /><path d="M8 3v4m8-4v4M4 11h16m-12 5h3" /></>,
  social: <><path d="M21 11a8 8 0 0 1-8 8H7l-4 3V11a9 9 0 0 1 18 0Z" /><path d="M8 10h8m-8 4h5" /></>,
  profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 5 0 0 1 16 0v2" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
};

export default function Icon({ name, size = 22, filled = false, strokeWidth = 1.6, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {paths[name]}
    </svg>
  );
}
