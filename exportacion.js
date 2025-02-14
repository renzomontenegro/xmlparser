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

    async identifyTables(templatePath) {
        const response = await fetch(templatePath);
        const arrayBuffer = await response.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, {bookVBA: true});
        
        for (let sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            if (sheet['!ref']) {
                console.log(`Sheet: ${sheetName}`);
                console.log(`Range: ${sheet['!ref']}`);
            }
            
            // Check for tables/lists
            if (sheet['!autofilter']) {
                console.log(`Table found in range: ${sheet['!autofilter'].ref}`);
            }
        }
        return workbook;
    }

    async exportSolicitud() {
        try {
            const arrayBuffer = await this.fetchTemplate('plantillas/Plantilla_Orden.xlsx');
            const workbook = await XlsxPopulate.fromDataAsync(arrayBuffer);
            const sheet = workbook.sheet(0);
            const formData = window.invoiceParser.collectFormData();

            // Fill in the basic fields
            sheet.cell('E8').value(formData.basic.ruc);
            sheet.cell('E10').value(formData.basic.razonSocial);
            sheet.cell('E12').value(formData.basic.moneda);
            sheet.cell('E14').value(formData.basic.descripcion);
            sheet.cell('H8').value(formData.basic.fechaEmision);
            sheet.cell('H10').value(formData.basic.numeroComprobante);
            sheet.cell('H12').value(formData.basic.importe);
            sheet.cell('K8').value(formData.basic.condicionPago);
            sheet.cell('K10').value(formData.basic.fechaVencimiento);
            sheet.cell('K12').value(formData.basic.solicitante);
            sheet.cell('K14').value(formData.basic.areaSolicitante);

            // Fill in the items with dynamic rows
            const startRow = 20;
            const endRow = 39; // Última fila de la tabla original
            const items = formData.items;
            
            // Add additional rows if needed
            if (items.length > 20) {
                const rowsToAdd = items.length - 20;
                
                // Mover contenido existente hacia abajo para hacer espacio
                for (let i = rowsToAdd - 1; i >= 0; i--) {
                    const targetRow = endRow + i + 1;
                    
                    // Copiar formato y contenido de la última fila de la tabla
                    ['C', 'D', 'E', 'F', 'G', 'H'].forEach(col => {
                        const newCell = sheet.cell(`${col}${targetRow}`);
                        const templateCell = sheet.cell(`${col}${endRow}`);
                        
                        // Copiar estilo
                        newCell.style({
                            horizontalAlignment: 'center',
                            verticalAlignment: 'center',
                            border: {
                                left: { style: 'thin' },
                                right: { style: 'thin' },
                                top: { style: 'thin' },
                                bottom: { style: 'thin' }
                            }
                        });

                        // Copiar fórmulas si existen
                        if (templateCell.formula()) {
                            newCell.formula(templateCell.formula());
                        }
                    });

                    // Ajustar altura de la fila
                    sheet.row(targetRow).height(sheet.row(endRow).height());
                }

                // Expandir el rango de la tabla
                const tableRange = sheet.range(`C20:H${endRow + rowsToAdd}`);
                tableRange.style({
                    border: {
                        outline: { style: 'thin' }
                    }
                });
            }

            // Fill all items
            items.forEach((item, index) => {
                const row = startRow + index;
                sheet.cell(`C${row}`).value(item.numeroItem);
                sheet.cell(`D${row}`).value(item.importe);
                sheet.cell(`E${row}`).value(item.porcentaje);
                sheet.cell(`F${row}`).value(item.lineaNegocio);
                sheet.cell(`G${row}`).value(item.centroCosto);
                sheet.cell(`H${row}`).value(item.proyecto);
            });

            // Calculate positions for additional fields based on last item row
            const lastItemRow = startRow + items.length - 1; // Última fila ocupada por items
            const offsetToCodigoBien = 3; // 3 filas después del último item
            const offsetToDetraccion = 5; // 5 filas después del último item
            const offsetToLicenciaInicio = 9; // 9 filas después del último item
            const offsetToLicenciaFin = 11; // 11 filas después del último item

            // Fill in additional fields with dynamic positions
            sheet.cell(`E${lastItemRow + offsetToCodigoBien}`).value(formData.basic.codigoBien);
            sheet.cell(`E${lastItemRow + offsetToDetraccion}`).value(formData.basic.porcentajeDetraccion);
            sheet.cell(`F${lastItemRow + offsetToLicenciaInicio}`).value(formData.basic.fechaInicioLicencia);
            sheet.cell(`F${lastItemRow + offsetToLicenciaFin}`).value(formData.basic.fechaFinLicencia);

            const blob = await workbook.outputAsync();
            this.createTemporaryDownload('Orden_Modificada.xlsx', blob);
        } catch (error) {
            console.error('Error in exportSolicitud:', error);
            alert('Error: ' + error.message);
        }
    }

    async exportERP() {
        try {
            const arrayBuffer = await this.fetchTemplate('plantillas/Plantilla_ERP.xlsx');
            const workbook = await XlsxPopulate.fromDataAsync(arrayBuffer);
            const sheet = workbook.sheet(0);
            const formData = window.invoiceParser.collectFormData();

            // Start from row 9 (after header)
            const startRow = 9;
            formData.items.forEach((item, index) => {
                const row = startRow + index;
                
                // Map data to correct columns starting from column C
                const rowData = {
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
                    M: '', // Moneda de pago
                    N: 'Estándar', // Tipo de factura
                    O: formData.basic.descripcion, // Descripción
                    // ... columnas P a Z vacías ...
                    AA: (index + 1).toString(), // Línea
                    AB: 'Ítem', // Tipo
                    AC: item.importe, // Importe
                    AD: item.centroCosto || '', // Combinación de distribución
                    // ... otros campos específicos del item ...
                    AK: 'PE_IGV_NREC_18', // Código de clasificación de impuestos
                    BQ: 'DET12' // Categoría comercial de transacción
                };

                // Fill each cell in the row
                Object.entries(rowData).forEach(([col, value]) => {
                    if (value !== undefined && value !== null) {
                        sheet.cell(`${col}${row}`).value(value);
                    }
                });
            });

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