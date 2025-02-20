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
            const arrayBuffer = await this.fetchTemplate('plantillas/Plantilla_ERP.xlsx');
            const workbook = await XlsxPopulate.fromDataAsync(arrayBuffer);
            const sheet = workbook.sheet(0);
            const formData = window.invoiceParser.collectFormData();

            // Obtener solo los códigos/valores de los campos select
            const condicionPagoValue = document.getElementById('condicionPago').value.split('-')[0].trim();
            const tipoFacturaValue = document.getElementById('tipoFactura').value.split('-')[0].trim();
            const cuentaContableValue = document.getElementById('cuentaContable').value.split('-')[0].trim();
            const porcentajeDetraccionValue = document.getElementById('porcentajeDetraccion').value.split('-')[0].trim();
            const codigoBienValue = document.getElementById('codigoBien').value.split('-')[0].trim();

            // Start from row 9 (after header)
            const startRow = 9;
            formData.items.forEach((item, index) => {
                const row = startRow + index;
                
                // Map data to correct columns starting from column C
                const rowData = {
                    A: '', // Dejar vacío como en la plantilla original
                    B: 'PE', // País por defecto
                    C: formData.basic.numeroComprobante, // Identificador de cabecera de factura
                    D: 'UNIVERSIDAD ESAN BU', // Unidad de negocio
                    E: 'EYARASCA', // Juego de importación
                    F: formData.basic.numeroComprobante, // Número de factura
                    G: formData.basic.moneda, // Moneda de factura
                    H: formData.basic.importe, // Importe de factura
                    I: formData.basic.fechaEmision, // Fecha de factura
                    J: formData.basic.razonSocial, // Proveedor
                    K: formData.basic.ruc, // Número de proveedor
                    L: 'SOLES-NACIONAL', // Sitio de proveedor
                    M: formData.basic.moneda, // Moneda de pago
                    N: tipoFacturaValue, // Tipo de factura (nuevo campo)
                    O: formData.basic.descripcion, // Descripción
                    P: cuentaContableValue, // Cuenta contable (nuevo campo)
                    Q: condicionPagoValue, // Condición de pago (nuevo campo)
                    R: codigoBienValue, // Código de bien detracción (nuevo campo)
                    S: porcentajeDetraccionValue, // Porcentaje detracción (nuevo campo)
                    // ... mantener otros campos existentes
                    AA: (index + 1).toString(), // Línea
                    AB: 'Ítem', // Tipo
                    AC: item.importe, // Importe
                    AD: item.centroCosto || '', // Combinación de distribución
                    AE: item.lineaNegocio || '', // Línea de negocio
                    AF: item.proyecto || '', // Proyecto
                    // ... mantener otros campos específicos del item ...
                    AK: 'PE_IGV_NREC_18', // Código de clasificación de impuestos
                    BQ: 'DET12' // Categoría comercial de transacción
                };

                // Fill each cell in the row
                Object.entries(rowData).forEach(([col, value]) => {
                    if (value !== undefined && value !== null && value !== '') {
                        // Formatear fechas si es necesario
                        if (col === 'I' && value) {
                            const date = new Date(value);
                            if (!isNaN(date.getTime())) {
                                value = date.toISOString().split('T')[0];
                            }
                        }
                        
                        // Formatear números si es necesario
                        if (['H', 'AC'].includes(col) && !isNaN(value)) {
                            value = parseFloat(value).toFixed(2);
                        }
                        
                        sheet.cell(`${col}${row}`).value(value);
                    }
                });
            });

            // Aplicar formato a la hoja
            // Establecer anchos de columna
            ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S'].forEach(col => {
                sheet.column(col).width(15);
            });

            // Formatear encabezados
            for (let col = 1; col <= 19; col++) {
                const cell = sheet.cell(`${String.fromCharCode(64 + col)}8`);
                cell.style('bold', true)
                    .style('fill', 'F2F2F2')
                    .style('horizontalAlignment', 'center');
            }

            const blob = await workbook.outputAsync();
            this.createTemporaryDownload('ERP_Modificado.xlsx', blob);
        } catch (error) {
            console.error('Error in exportERP:', error);
            alert('Error: ' + error.message);
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