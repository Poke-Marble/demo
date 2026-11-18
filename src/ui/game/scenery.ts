/** Decorative scenery, not map geography or game state. No external assets. */
export function createWorldScenery() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 640 640');
  svg.setAttribute('class', 'pm-world-scenery');
  svg.setAttribute('aria-hidden', 'true');
  const trees = [
    [152, 198],
    [181, 182],
    [210, 174],
    [443, 186],
    [471, 203],
    [489, 232],
    [147, 384],
    [172, 405],
    [190, 426],
    [428, 425],
    [453, 408],
    [477, 388],
    [218, 458],
    [242, 470],
    [382, 473],
    [405, 461],
    [146, 250],
    [143, 280],
    [498, 287],
    [493, 319],
  ];
  svg.innerHTML = `<defs>
    <pattern id="pm-grass" width="28" height="28" patternUnits="userSpaceOnUse"><path d="m6 8 2-3 2 3m10 14 2-3 2 3" fill="none" stroke="#81b97d" stroke-width="1.5" opacity=".45"/></pattern>
    <symbol id="pm-tree" viewBox="0 0 36 46"><ellipse cx="18" cy="40" rx="15" ry="5" fill="#51885e" opacity=".3"/><path d="M16 25h5v16h-5z" fill="#8c7960"/><path d="M18 2C6 5 2 15 5 21c-9 12 2 18 13 17 12 1 22-6 14-17 2-7-3-16-14-19" fill="#3f8064"/><path d="M18 5C9 8 7 15 10 20c-6 7-2 11 5 11" fill="none" stroke="#71ac73" stroke-width="5" stroke-linecap="round"/></symbol>
  </defs>
  <rect width="640" height="640" rx="30" fill="#a2ce91"/>
  <rect width="640" height="640" rx="30" fill="url(#pm-grass)"/>
  <path d="M145 148Q218 102 283 151T484 145L517 324Q495 422 435 481L250 511Q132 451 128 355Z" fill="#b4d99a" stroke="#90bd80" stroke-width="6"/>
  <path d="M226 161q31 63 82 66t65 74q10 59 73 86l52 12" fill="none" stroke="#e3e9b9" stroke-width="47"/>
  <path d="M226 161q31 63 82 66t65 74q10 59 73 86l52 12" fill="none" stroke="#7ec2ce" stroke-width="33"/>
  <path d="m302 224 20 32m-8-37 20 32" stroke="#a88e63" stroke-width="6"/>
  <path d="M187 331q44-34 80-4t3 53q-58 26-89-4t6-45" fill="#d9e8b2"/>
  <path d="M193 338q38-28 68-3t1 38q-50 24-75-1t6-34" fill="#83c6d2"/>
  <path d="m193 351 26-4m9 17 28-5m156-32 22 8m-58-64 15 14" stroke="#c4e8e7" stroke-width="3" stroke-linecap="round"/>
  <path d="M156 477 190 427l32 50m183-270 26-48 30 48" fill="#86a78d" stroke="#759982" stroke-width="3"/>
  <path d="m177 446 13-19 12 19-10-4-6 5zm245-270 9-17 11 18-9-4-5 4z" fill="#e3e7cd"/>
  ${trees.map(([x, y]) => `<use href="#pm-tree" x="${x}" y="${y}" width="32" height="42"/>`).join('')}
  <path d="M62 62H578V578H62Z" fill="none" stroke="#e8e1b1" stroke-width="22" stroke-linejoin="round"/>
  <path d="M62 62H578V578H62Z" fill="none" stroke="#c0af83" stroke-width="2" stroke-dasharray="5 9" stroke-linejoin="round"/>
  <g fill="#f1dc94"><circle cx="257" cy="418" r="3"/><circle cx="265" cy="423" r="3"/><circle cx="370" cy="175" r="3"/><circle cx="378" cy="179" r="3"/></g>`;
  return svg;
}
