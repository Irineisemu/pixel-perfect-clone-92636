// @ts-nocheck
// Icon component — inline SVG, lucide-style strokes.
const P = {
    // outline strokes; 24x24, stroke=currentColor 2 px, round caps.
    search: 'M11 4a7 7 0 1 0 4.95 11.95L21 21M11 18a7 7 0 0 1-7-7',
    bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0',
    "chevron-down": 'm6 9 6 6 6-6',
    "chevron-right": 'm9 6 6 6-6 6',
    command: 'M15 6a3 3 0 1 1 3 3M9 6a3 3 0 1 0-3 3M15 18a3 3 0 1 0 3-3M9 18a3 3 0 1 1-3-3M6 9h12v6H6z',
    "trending-up": 'M22 7 13.5 15.5l-5-5L2 17M16 7h6v6',
    "trending-down": 'M22 17 13.5 8.5l-5 5L2 7M16 17h6v-6',
    activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
    "alert-octagon": 'M7.86 2h8.28L22 7.86v8.28L16.14 22H7.86L2 16.14V7.86zM12 8v4M12 16h.01',
    "alert-triangle": 'm10.29 3.86-8.18 14.14A2 2 0 0 0 3.84 21h16.32a2 2 0 0 0 1.73-3L13.71 3.86a2 2 0 0 0-3.42 0M12 9v4M12 17h.01',
    "alert-circle": 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 8v4M12 16h.01',
    layers: 'm12 2 9 5-9 5-9-5zM3 12l9 5 9-5M3 17l9 5 9-5',
    "refresh-ccw": 'M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5',
    filter: 'M22 3H2l8 9.46V19l4 2v-8.54z',
    x: 'M18 6 6 18M6 6l12 12',
    inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z',
    loader: 'M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83',
    clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 6v6l4 2',
    "building-2": 'M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18ZM6 12H4a2 2 0 0 0-2 2v8h4M18 9h2a2 2 0 0 1 2 2v11h-4M10 6h4M10 10h4M10 14h4M10 18h4',
    "file-text": 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
    user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
    copy: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z',
    "external-link": 'M15 3h6v6M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5',
    "bookmark-plus": 'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2zM12 7v6M9 10h6',
    "share-2": 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98',
    hash: 'M4 9h16M4 15h16M10 3 8 21M16 3l-2 18',
    "arrow-right": 'M5 12h14M12 5l7 7-7 7',
    "corner-down-left": 'M9 10l-5 5 5 5M20 4v7a4 4 0 0 1-4 4H4',
    mail: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6 12 13 2 6',
    phone: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7a2 2 0 0 1 1.72 2z',
    save: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM7 3v6h10V3M7 21v-8h10v8',
    check: 'M20 6 9 17l-5-5',
    "check-circle-2": 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M9 12l2 2 4-4',
    info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 16v-4M12 8h.01',
    target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
    plus: 'M12 5v14M5 12h14',
    "more-horizontal": 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2M19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2M5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2',
    pause: 'M6 4h4v16H6zM14 4h4v16h-4z',
    play: 'M5 3v18l15-9z',
    "file-search": 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M14 2v6h6M11.5 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5M13.5 13.5 16 16',
    users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
    radio: 'M4.93 19.07a10 10 0 0 1 0-14.14M7.76 16.24a6 6 0 0 1 0-8.49M16.24 7.76a6 6 0 0 1 0 8.49M19.07 4.93a10 10 0 0 1 0 14.14M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2',
    "chevron-left": 'm15 18-6-6 6-6',
    trash: 'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6',
    edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z',
    sparkles: 'M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5zM19 14l.75 2.25L22 17l-2.25.75L19 20l-.75-2.25L16 17l2.25-.75zM5 3l.75 2.25L8 6l-2.25.75L5 9l-.75-2.25L2 6l2.25-.75z',
    "alert-circle-2": 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 8v4M12 16h.01',
    "rotate-ccw": 'M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5',
    eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
    flag: 'M4 22V4a1 1 0 0 1 1-1h12l-2 5 2 5H5M4 22h6',
  };

  function Icon({ name, className = "h-4 w-4", strokeWidth = 2, ...rest }) {
    const d = P[name];
    if (!d) return null;
    const paths = d.split(/(?<=Z)|(?=M)/i).filter(Boolean);
    return (
      <svg
        viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
        className={className} aria-hidden="true" {...rest}
      >
        {paths.map((p, i) => <path key={i} d={p.trim()} />)}
      </svg>
    );
  }

  window.Icon = Icon;
})();
