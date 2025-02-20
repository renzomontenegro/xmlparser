class ExcelExporter {
    constructor() {
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        document.getElementById('exportSolicitudBtn').addEventListener('click', () => this.exportSolicitud());
        document.getElementById('exportERPBtn').addEventListener('click', () => this.exportERP());
    }

    async fetchTemplate(templatePath) {
        const response = await fetch(templatePath);
        const arrayBuffer = await response.arrayBuffer();
        return arrayBuffer;
    }

    async exportSolicitud() {
        try {
            const fileInput = document.getElementById('xmlFile');
            let fileName = fileInput.files[0] ? fileInput.files[0].name.replace('.xml', '') : 'Sin_Archivo';
    
            const workbook = await XlsxPopulate.fromBlankAsync();
            const sheet = workbook.sheet(0);
    
            // Configurar ancho de columnas
            sheet.column('A').width(25);
            sheet.column('B').width(40);
            sheet.column('C').width(15);
            sheet.column('D').width(25);
            sheet.column('E').width(25);
            sheet.column('F').width(25);
    
            // Funciones helper para estilo
            const setBold = (cell) => cell.style('bold', true);
            const setRight = (cell) => cell.style('horizontalAlignment', 'right');
    
            let currentRow = 2;
            
            // Encabezado con nombre del archivo
            setBold(sheet.cell('A' + currentRow)).value(`Información de la Factura ${fileName}`);
            currentRow += 2;
    
            // Obtener solo los códigos/valores de los campos select
            const condicionPagoValue = document.getElementById('condicionPago').value.split('-')[0].trim();
            const codDetraccionValue = document.getElementById('codigoBien').value.split('-')[0].trim();
            const porcentajeDetraccionValue = document.getElementById('porcentajeDetraccion').value.split('-')[0].trim();
            const cuentaContableValue = document.getElementById('cuentaContable').value.split('-')[0].trim();
            const tipoFacturaValue = document.getElementById('tipoFactura').value.split('-')[0].trim();

            // Datos básicos actualizado con nuevos campos
            const basicInfo = [
                { label: 'RUC:', value: document.getElementById('ruc').value },
                { label: 'Razón Social:', value: document.getElementById('razonSocial').value },
                { label: 'Moneda:', value: document.getElementById('moneda').value },
                { label: 'Fecha Emisión:', value: document.getElementById('fechaEmision').value },
                { label: 'N° Comprobante:', value: document.getElementById('numeroComprobante').value },
                { label: 'Importe Total (Con IGV):', value: document.getElementById('importe').value },
                { label: 'Condición de Pago:', value: condicionPagoValue },
                { label: 'Fecha Vencimiento:', value: document.getElementById('fechaVencimiento').value },
                { label: 'Cuenta Contable:', value: cuentaContableValue },
                { label: 'Tipo de Factura:', value: tipoFacturaValue }
            ];
    
            basicInfo.forEach(info => {
                setBold(sheet.cell('A' + currentRow)).value(info.label);
                setRight(sheet.cell('B' + currentRow)).value(info.value);
                currentRow++;
            });
    
            currentRow += 2;
    
            // Datos adicionales actualizados
            setBold(sheet.cell('A' + currentRow)).value('Información Adicional');
            currentRow += 2;
    
            const additionalInfo = [
                { label: 'Solicitante:', value: document.getElementById('solicitante').value },
                { label: 'Área Solicitante:', value: document.getElementById('areaSolicitante').value },
                { label: 'Código de Detracción:', value: codDetraccionValue },
                { label: 'Porcentaje Detracción:', value: porcentajeDetraccionValue },
                { label: 'Fecha Inicio Licencia:', value: document.getElementById('fechaInicioLicencia').value || 'No aplica' },
                { label: 'Fecha Fin Licencia:', value: document.getElementById('fechaFinLicencia').value || 'No aplica' }
            ];
    
            additionalInfo.forEach(info => {
                setBold(sheet.cell('A' + currentRow)).value(info.label);
                setRight(sheet.cell('B' + currentRow)).value(info.value);
                currentRow++;
            });
    
            currentRow += 2;
    
            // Tabla de items
            setBold(sheet.cell('A' + currentRow)).value('Detalle de Items');
            currentRow += 2;
    
            const headers = ['N°', 'Base Imponible', 'Porcentaje (%)', 'Línea de Negocio', 'Centro de Costo', 'Proyecto'];
            headers.forEach((header, index) => {
                setBold(sheet.cell(String.fromCharCode(65 + index) + currentRow)).value(header);
            });
            currentRow++;
    
            const formData = window.invoiceParser.collectFormData();
            let sumBaseImponible = 0;
            let sumPorcentaje = 0;
    
            formData.items.forEach((item, index) => {
                sheet.cell('A' + currentRow).value(index + 1);
                setRight(sheet.cell('B' + currentRow)).value(parseFloat(item.importe));
                setRight(sheet.cell('C' + currentRow)).value(parseFloat(item.porcentaje));
                sheet.cell('D' + currentRow).value(item.lineaNegocio);
                sheet.cell('E' + currentRow).value(item.centroCosto);
                sheet.cell('F' + currentRow).value(item.proyecto);
                currentRow++;
    
                sumBaseImponible += parseFloat(item.importe) || 0;
                sumPorcentaje += parseFloat(item.porcentaje) || 0;
            });
    
            // Totales y referencias
            currentRow++;
            setBold(sheet.cell('A' + currentRow)).value('Total:');
            setBold(setRight(sheet.cell('B' + currentRow))).value(sumBaseImponible.toFixed(2));
            setBold(setRight(sheet.cell('C' + currentRow))).value(sumPorcentaje.toFixed(2) + '%');
            
            currentRow += 2;
            const importeTotal = parseFloat(document.getElementById('importe').value) || 0;
            const importeSinIGV = importeTotal / 1.18;
    
            setBold(sheet.cell('A' + currentRow)).value('Importe SIN IGV (-18%):');
            setRight(sheet.cell('B' + currentRow)).value(importeSinIGV.toFixed(2));
            currentRow++;
    
            setBold(sheet.cell('A' + currentRow)).value('Importe CON IGV:');
            setRight(sheet.cell('B' + currentRow)).value(importeTotal.toFixed(2));
    
            const blob = await workbook.outputAsync();
            this.createTemporaryDownload(`Información_Factura_${fileName}.xlsx`, blob);
        } catch (error) {
            console.error('Error in exportSolicitud:', error);
            alert('Error al exportar: ' + error.message);
        }
    }

    async exportERP() {
        try {
            // Cargar la nueva plantilla que solo tiene la hoja MACRO ORACLE
            const arrayBuffer = await this.fetchTemplate('plantillas/Plantilla_Oracle.xlsx');
            const workbook = await XlsxPopulate.fromDataAsync(arrayBuffer);
            const sheet = workbook.sheet('MACRO ORACLE');
            const formData = window.invoiceParser.collectFormData();
    
            // Función auxiliar para formatear fecha en español
            const formatDateToSpanish = (dateStr) => {
                const date = new Date(dateStr);
                const months = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
                return `${date.getDate()} ${months[date.getMonth()]}`;
            };
    
            // Obtener fecha actual en Lima, Perú
            const today = new Date();
            const limaDate = new Date(today.toLocaleString("en-US", {timeZone: "America/Lima"}));
    
            // Extraer la segunda parte del número de factura
            const facturaNum = formData.basic.numeroComprobante.split('-')[1] || '';
            
            // Construir la descripción base
            const baseDescription = `FE/${facturaNum}, ${formData.basic.descripcion}, ${formatDateToSpanish(formData.basic.fechaEmision)}`;
    
            // Procesar cada línea de item
            formData.items.forEach((item, index) => {
                const rowNum = 9 + index; // Empezar desde la fila 9
    
                // Columnas fijas
                sheet.cell(`E${rowNum}`).value('1');
                sheet.cell(`F${rowNum}`).value('UNIVERSIDAD ESAN BU');
                sheet.cell(`G${rowNum}`).value('EYARASCA');
                
                // Datos del formulario
                sheet.cell(`H${rowNum}`).value(formData.basic.numeroComprobante);
                sheet.cell(`I${rowNum}`).value(formData.basic.moneda);
                sheet.cell(`J${rowNum}`).value(parseFloat(formData.basic.importe));
                sheet.cell(`K${rowNum}`).value(formData.basic.fechaEmision);
                sheet.cell(`L${rowNum}`).value(formData.basic.razonSocial);
                sheet.cell(`M${rowNum}`).value(formData.basic.ruc);
                sheet.cell(`N${rowNum}`).value(''); // Sitio de Proveedor vacío
                sheet.cell(`O${rowNum}`).value(''); // Moneda de Pago vacío
                sheet.cell(`Q${rowNum}`).value(baseDescription);
                sheet.cell(`S${rowNum}`).value(formData.basic.condicionPago);
                
                // Fechas actuales
                sheet.cell(`W${rowNum}`).value(limaDate);
                sheet.cell(`X${rowNum}`).value(limaDate);
                
                // Valores fijos y fechas adicionales
                sheet.cell(`AG${rowNum}`).value('TC Venta');
                
                // Formatear fecha de cambio al formato dd/mm/yyyy
                const fechaEmision = new Date(formData.basic.fechaEmision);
                const fechaCambioFormateada = fechaEmision.toLocaleDateString('es-PE', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                });
                sheet.cell(`AH${rowNum}`).value(fechaCambioFormateada);
                
                sheet.cell(`BW${rowNum}`).value('Peru');
                sheet.cell(`BX${rowNum}`).value(''); // Información Adicional vacío
                
                // Datos de línea
                sheet.cell(`CA${rowNum}`).value(index + 1);
                sheet.cell(`CB${rowNum}`).value('Ítem');
                sheet.cell(`CC${rowNum}`).value(parseFloat(item.importe));
                sheet.cell(`CG${rowNum}`).value(baseDescription);
                sheet.cell(`CS${rowNum}`).value(''); // Combinación de Distribución vacío
            });
    
            // Determinar el nombre del archivo
            const fileInput = document.getElementById('xmlFile');
            let fileName = fileInput.files[0] 
                ? `Formato_ERP_${fileInput.files[0].name.replace('.xml', '')}.xlsx`
                : 'Formato_ERP.xlsx';
    
            // Exportar el archivo
            const blob = await workbook.outputAsync();
            this.createTemporaryDownload(fileName, blob);
        } catch (error) {
            console.error('Error in exportERP:', error);
            alert('Error al exportar: ' + error.message);
        }
    }

    async createTemporaryDownload(filename, blob) {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }
}

// Create global instance
window.excelExporter = new ExcelExporter();