// Dimensiones en puntos PDF (72 puntos = 1 pulgada).
// Oficio varía por país: se ofrecen explícitamente las dos medidas comunes.
export const PAPER_SIZES = [
  {id:'a4',label:'A4 — 21 × 29.7 cm',width:595.28,height:841.89},
  {id:'letter',label:'Carta — 21.59 × 27.94 cm',width:612,height:792},
  {id:'oficio',label:'Oficio — 21.59 × 33.02 cm (8.5 × 13 pulgadas)',width:612,height:936},
  {id:'oficio-340',label:'Oficio de 34 cm — 21.6 × 34 cm',width:216/25.4*72,height:340/25.4*72},
  {id:'legal',label:'Legal — 21.59 × 35.56 cm (8.5 × 14 pulgadas)',width:612,height:1008},
  {id:'tabloid',label:'Tabloide — 27.94 × 43.18 cm (11 × 17 pulgadas)',width:792,height:1224},
  {id:'a3',label:'A3 — 29.7 × 42 cm',width:297/25.4*72,height:420/25.4*72},
  {id:'a5',label:'A5 — 14.8 × 21 cm',width:148/25.4*72,height:210/25.4*72},
  {id:'half-letter',label:'Media carta — 13.97 × 21.59 cm',width:396,height:612},
  {id:'executive',label:'Ejecutivo — 18.415 × 26.67 cm',width:522,height:756},
];
export const paperById=Object.fromEntries(PAPER_SIZES.map(size=>[size.id,size]));
