import { db } from "./firebase.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

// ---------- Necesito una longitud específica, así que relleno con los ceros que hacen falta ----------
function pad(n){ 
    return n.toString().padStart(2,"0");  //Convierto a stringg y le agrego tantos ceros al inicio como hagan falta para tener 2 caracteres
}

// Convertir un objeto Date de Js en un string ISO estandarizado

function ymdFromDate(d){
  const yr = d.getFullYear();           //Obtener el año completo
  const m  = pad(d.getMonth()+1);       //Los meses en Js empiezan en 0, así que lo obtengo, le sumo 1 y lo normalizo
  const da = pad(d.getDate());          //Obtengo el día del mes
  return `${yr}-${m}-${da}`;            //Combino todo en el formato ISO YYY-MM-DD
}

// Busca la fecha del Lunes de la semana actual

function getMondayOfThisWeek(base){
  const jsDay = base.getDay();                      //Devuelve el número del día de la semana según Js (Domingo es 0)
  const offsetToMonday = (jsDay + 6) % 7;           //Utilizamos un artilugio que nos dice "cuantos dias hay que retroceder para llegar al lunes"
  const mon = new Date(base);                       //Crea una copia de la fecha original
  mon.setDate(base.getDate() - offsetToMonday);     //Restamos la cantidad de dias que obtuvimos en el paso anterior (Js Maneja esto correctamente en caso de principios de mes también)
  return mon;
}

const diasSemana = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];

/* 

---------- Datos ----------

*/

//Función para leer la programación desde la BD

async function loadDay(dateStr){                                            //Recibe un string con formato YYYY-MM-DD
  const snap = await getDoc(doc(db, "programacion", dateStr));              //Con esa info accedemos al documento de la BD, colección programación, documento "dateStr"
  if(!snap.exists()) return [];                                             //Verifica si el documento existe, sino, devuelve un array vacío
  const data = snap.data();                                                 //Obtiene los datos de los documentos
  return Array.isArray(data.blocks) ? data.blocks : [];                     //Si el campo "blocks" existe y es un array, lo entrega tal cual. Sino devuelve un array vacío
}

/* 

---------- Render ----------

*/
function renderSemana(rowsData){
  const tbody = document.getElementById("publicProgBody");      //Obtiene la referencia al tbody para buscar en el HTML el espacio donde se va a armar la tabla
  if (!tbody) return;                                           //Si no existe, salimos
  tbody.innerHTML = "";                                         //Limpiamos el contenido previo
  rowsData.forEach(r=>{                                         //Recorremos los datos recibidos. Cada elemento de rowsData es un bloque de programación con Fecha, inicio, fin, programa, conductor...
    const tr = document.createElement("tr");                    //Una fila por bloque
    const hora = (r.block.start && r.block.end)                 //Calculamos el texto de la columna hora
      ? `${r.block.start} - ${r.block.end}`
      : (r.block.start || r.block.end || "—");
      //Arma el HTML de cada fila
    tr.innerHTML = `                                            
      <td>${r.labelDia}</td>
      <td>${hora}</td>
      <td><b>${r.block.programa || ""}</b></td>
      <td>${r.block.conductor || ""}</td>
    `;
    tbody.appendChild(tr);                                      //Agregga la fila al cuerpo de la tabla. Vamos llenando la tabla día por día, bloque por bloque
  });
}

/* 

---------- Funcion maestra que usa auxiliares ----------

*/

async function initPublicProg(){
  const hoy = new Date();                                               // Obtenemos la fecha local del usuario
  const lunes = getMondayOfThisWeek(hoy);                               //Calculamos el lunes de esa semana

  const fechasYLabels = [];                                             //Creamos la lista de los 7 días
  for(let i=0;i<7;i++){
    const d = new Date(lunes);
    d.setDate(lunes.getDate()+i);
    fechasYLabels.push({
      fechaStr: ymdFromDate(d),
      labelDia: diasSemana[i]
    });
  }

  // Traer bloques de cada día y armar filas

  const rowsData = [];
  for(const item of fechasYLabels){
    const blocks = await loadDay(item.fechaStr);                        //Cada loadDay devuelve un array con los programas del día (bloques)
    blocks.forEach(b=>{
      rowsData.push({                                                   //Con rowsData vamos acumulando los bloques
        labelDia: item.labelDia,
        fecha: item.fechaStr,
        block: b
      });
    });
  }

  // Ordenamos los resultados

  rowsData.sort((a,b)=>{
    if(a.fecha < b.fecha) return -1;                                    //Lunes antes que martes, etc
    if(a.fecha > b.fecha) return 1;                                     
    return (a.block.start||"") < (b.block.start||"") ? -1 : 1;          //Dentro de un mismo día, de menor a mayor
  });

  renderSemana(rowsData);                                               //Muestra la tabla
}

// Auto-inicio cuando el DOM está listo (por si el script carga antes que la tabla)

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPublicProg, { once:true });
} else {
  initPublicProg();
}
