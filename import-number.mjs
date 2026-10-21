// Accept decimal values with up to four meaningful places, tolerating only
// floating-point noise near that grid (not genuine additional precision).
export function importNumber(value){
 const text=String(value).trim();if(!/^\d+(?:\.\d+)?$/.test(text))throw Error('usa un número positivo con un máximo de cuatro decimales.');
 const n=Number(text);if(!Number.isFinite(n))throw Error('usa un número positivo con un máximo de cuatro decimales.');
 const rounded=Number(n.toFixed(4)),tolerance=Math.min(1e-8,Number.EPSILON*8*Math.max(1,Math.abs(n)));
 if((n>0&&rounded===0)||Math.abs(n-rounded)>tolerance)throw Error('usa un número positivo con un máximo de cuatro decimales.');
 return rounded.toFixed(4).replace(/\.?0+$/,'')||'0';
}
