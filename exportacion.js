class ExcelExporter {
    constructor() {
        // No necesitamos inicializar event listeners aquí
    }

    async fetchTemplate(templatePath) {
        const response = await fetch(templatePath);
        const arrayBuffer = await response.arrayBuffer();
        return arrayBuffer;
    }

    async exportSolicitud(options = {}) {
        const form = document.getElementById('invoiceForm');
        if (!form.checkValidity()) {
            form.reportValidity();
            return; // Detener la ejecución si no es válido
        }

        try {
            const formData = window.invoiceParser.collectFormData();
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
            
            // Encabezado con número de comprobante
            setBold(sheet.cell('A' + currentRow)).value(`Información de la Factura ${formData.basic.numeroComprobante}`);
            currentRow += 2;
    
            // Obtener valores de los campos select (mantener la descripción completa)
            const codDetraccionValue = document.getElementById('codigoBien').value;
            const porcentajeDetraccionValue = document.getElementById('porcentajeDetraccion').value;
            const cuentaContableValue = document.getElementById('cuentaContableSearch').value.split(' - ')[0];
            const tipoFacturaValue = document.getElementById('tipoFactura').value;
            const igvPorcentajeValue = document.getElementById('igvPorcentaje').value + '%';
    
            // Datos básicos actualizado con nuevos campos
            const basicInfo = [
                { label: 'RUC:', value: formData.basic.ruc },
                { label: 'Razón Social:', value: formData.basic.razonSocial },
                { label: 'Moneda:', value: formData.basic.moneda },
                { label: 'Fecha Emisión:', value: formData.basic.fechaEmision },
                { label: 'N° Comprobante:', value: formData.basic.numeroComprobante },
                { label: 'Importe Total (Con IGV):', value: formData.basic.importe },
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
                { label: 'Fecha Fin Licencia:', value: document.getElementById('fechaFinLicencia').value || 'No aplica' },
                { label: 'Porcentaje IGV:', value: igvPorcentajeValue }
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

            // Agregar otros cargos si existen
            if (formData.otrosCargos) {
                currentRow++;
                setBold(sheet.cell('A' + currentRow)).value('Otros Cargos:');
                setRight(sheet.cell('B' + currentRow)).value(parseFloat(formData.otrosCargos.monto).toFixed(2));
            }
    
            const blob = await workbook.outputAsync();
            
            if (options?.returnBlob) {
                return blob;
            }
    
            // Nombre del archivo con número de comprobante
            const fileName = `Resumen-Factura-${formData.basic.numeroComprobante}.xlsx`;
            this.createTemporaryDownload(fileName, blob);
        } catch (error) {
            console.error('Error in exportSolicitud:', error);
            alert('Error al exportar: ' + error.message);
            throw error;
        }
    }

    // Localiza esta sección en el método exportERP de la clase ExcelExporter
    async exportERP(options = {}) {
        const form = document.getElementById('invoiceForm');
        if (!form.checkValidity()) {
            form.reportValidity();
            return; // Detener la ejecución si no es válido
        }

        try {
            const arrayBuffer = await this.fetchTemplate('plantillas/Plantilla_Oracle.xlsx');
            const workbook = await XlsxPopulate.fromDataAsync(arrayBuffer);
            const sheet = workbook.sheet('MACRO ORACLE');
            const formData = window.invoiceParser.collectFormData();

            // Funciones de formateo de fecha
            const formatDate = (dateStr) => {
                const [year, month, day] = dateStr.split('-');
                return `${day}/${month}/${year}`;
            };

            const formatDateToSpanish = (dateStr) => {
                const [year, month, day] = dateStr.split('-');
                const months = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
                return `${parseInt(day)} ${months[parseInt(month) - 1]}`;
            };

            // Formatear fechas
            const fechaEmisionFormateada = formatDate(formData.basic.fechaEmision);
            
            // Obtener fecha actual formateada
            const today = new Date();
            const formattedToday = today.toLocaleDateString('es-PE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });

            // Extraer número de factura y construir descripción
            const facturaNum = formData.basic.numeroComprobante.split('-')[1] || '';
            const baseDescription = `${formData.basic.razonSocial} ${formData.basic.descripcion}`;
            
            // Obtener el número Oracle del proveedor
            let numeroOracle = '';
            const rucValue = formData.basic.ruc;
            
            // Buscar el número Oracle en la lista de proveedores
            if (window.googleSheetsDb && window.googleSheetsDb.data && window.googleSheetsDb.data.proveedores) {
                const proveedor = window.googleSheetsDb.data.proveedores.find(p => p.value === rucValue);
                if (proveedor && proveedor.label) {
                    const parts = proveedor.label.split(' - ');
                    if (parts.length >= 3) {
                        numeroOracle = parts[2].trim();
                    }
                }
            }

            // Procesar items normales y otros cargos
            let allItems = [...formData.items];
            if (formData.otrosCargos) {
                allItems = allItems.concat(formData.otrosCargos.items);
            }

            allItems.forEach((item, index) => {
                const rowNum = 9 + index;

                sheet.cell(`E${rowNum}`).value('1');
                sheet.cell(`F${rowNum}`).value('UNIVERSIDAD ESAN BU');
                sheet.cell(`G${rowNum}`).value('EYARASCA');
                sheet.cell(`H${rowNum}`).value(formData.basic.numeroComprobante);
                sheet.cell(`I${rowNum}`).value(formData.basic.moneda);
                sheet.cell(`J${rowNum}`).value(parseFloat(formData.basic.importe));
                sheet.cell(`K${rowNum}`).value(fechaEmisionFormateada);
                sheet.cell(`L${rowNum}`).value(formData.basic.razonSocial);
                sheet.cell(`M${rowNum}`).value(formData.basic.ruc);
                sheet.cell(`N${rowNum}`).value(numeroOracle); // Colocar el número Oracle en la columna N
                sheet.cell(`O${rowNum}`).value('');
                sheet.cell(`P${rowNum}`).value('Estándar');
                sheet.cell(`Q${rowNum}`).value(baseDescription);
                
                // Fechas actuales
                sheet.cell(`W${rowNum}`).value(formattedToday);
                sheet.cell(`X${rowNum}`).value(formattedToday);
                
                sheet.cell(`AG${rowNum}`).value('TC Venta');
                sheet.cell(`AH${rowNum}`).value(fechaEmisionFormateada);
                
                sheet.cell(`BW${rowNum}`).value('Peru');
                sheet.cell(`BX${rowNum}`).value('');
                
                sheet.cell(`CA${rowNum}`).value(index + 1);
                sheet.cell(`CB${rowNum}`).value('Ítem');
                sheet.cell(`CC${rowNum}`).value(parseFloat(item.importe));
                sheet.cell(`CG${rowNum}`).value(baseDescription);
                sheet.cell(`CS${rowNum}`).value('');

                // Obtener el código de detracción y asegurar valor por defecto
                const codigoDetraccion = (document.getElementById('codigoBien').value.split(' - ')[0] || '').padStart(3, '0');
                
                // Formatear Información Adicional - usar puntos si faltan valores
                const infoAdicional = `...01....5.01.${codigoDetraccion || '.'}.......`;

                // Obtener valores con fallback a punto
                const cuentaContable = formData.cuentaContableSearch || '.';
                const lineaNegocio = item.lineaNegocio || '.';
                const centroCosto = item.centroCosto || '.';
                const proyecto = item.proyecto || '.';
                
                // Formatear Combinación de Distribución
                const combinacionDistribucion = `E1.${cuentaContable}.${lineaNegocio}.${centroCosto}.${proyecto}.U00.00.00`;

                sheet.cell(`BX${rowNum}`).value(infoAdicional);
                sheet.cell(`CS${rowNum}`).value(combinacionDistribucion);
            });

            const blob = await workbook.outputAsync();
            
            if (options?.returnBlob) {
                return blob;
            }

            const fileName = `Formato_ERP_${formData.basic.numeroComprobante}.xlsx`;
            this.createTemporaryDownload(fileName, blob);
        } catch (error) {
            console.error('Error in exportERP:', error);
            alert('Error al exportar: ' + error.message);
            throw error;
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


/*Exportación en JSON*/ 

// Actualizar esta sección en exportacion.js para manejar correctamente los nuevos formatos
class FormStorage {
    constructor() {
        this.initializeFormStorageEvents();
    }

    initializeFormStorageEvents() {
        // Solo manejar el evento de saveFormBtn aquí
        document.getElementById('saveFormBtn').addEventListener('click', (e) => {
            e.preventDefault();
            const form = document.getElementById('invoiceForm');
            if (form.checkValidity()) {
                this.saveForm();
            } else {
                form.reportValidity();
            }
        });
        
        document.getElementById('jsonFile').addEventListener('change', (e) => this.loadForm(e));
    }

    async saveForm() {
        const form = document.getElementById('invoiceForm');
        if (!form.checkValidity()) {
            form.reportValidity();
            return; // Detener la ejecución si no es válido
        }

        try {
            // Recolectar todos los datos del formulario
            const formData = window.invoiceParser.collectFormData();

            // Obtener solo el código del tipo de factura y cuenta contable
            const tipoFacturaValue = document.getElementById('tipoFactura').value;
            const cuentaContableValue = document.getElementById('cuentaContableSearch').value;
            
            formData.tipoFactura = tipoFacturaValue.split('-')[0].trim();
            formData.cuentaContableSearch = cuentaContableValue.split(' - ')[0].trim();
            formData.baseImponible = document.getElementById('baseImponible').value;
            formData.igv = document.getElementById('igv').value;
            formData.igvPorcentaje = document.getElementById('igvPorcentaje').value;
            
            // Agregar datos adicionales que no están en collectFormData
            const additionalFields = [
                'numeroComprobanteParte1',
                'numeroComprobanteParte2',
                'cuentaContableSearch',
                'tipoFactura'
            ];

            additionalFields.forEach(fieldId => {
                const element = document.getElementById(fieldId);
                if (element) {
                    formData[fieldId] = element.value;
                }
            });

            // Obtener el valor directamente desde excelDb
            const cuentaContableFullValue = document.getElementById('cuentaContableSearch').value;
            const cuentaContableCodigo = cuentaContableFullValue.split(' - ')[0].trim();
            
            // Sobrescribir el valor para asegurarnos que solo tenga el código
            formData.cuentaContableSearch = cuentaContableCodigo;

            // Convertir a JSON y crear blob
            const jsonString = JSON.stringify(formData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });

            // Generar nombre de archivo basado en el número de comprobante o fecha
            const comprobante = formData.basic.numeroComprobante || 'formulario';
            const fecha = new Date().toISOString().split('T')[0];
            const fileName = `Backup_${comprobante}_${fecha}.json`;

            // Crear y activar enlace de descarga
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error('Error saving form:', error);
            alert('Error al guardar el formulario: ' + error.message);
        }
    }

    async loadForm(event) {
        try {
            const file = event.target.files[0];
            if (!file) return;
    
            const text = await file.text();
            const formData = JSON.parse(text);
    
            // Cargar datos básicos sin limpiar el formulario
            Object.entries(formData.basic).forEach(([key, value]) => {
                const element = document.getElementById(key);
                if (element) element.value = value;
            });
    
            // Asegurar carga específica del RUC y campo rucSearch
            if (formData.basic.ruc) {
                document.getElementById('ruc').value = formData.basic.ruc;
                document.getElementById('rucSearch').value = formData.basic.ruc;
            }
    
            // Cargar campos de desglose
            if (formData.baseImponible) {
                document.getElementById('baseImponible').value = formData.baseImponible;
            }
            if (formData.igv) {
                document.getElementById('igv').value = formData.igv;
            }
            if (formData.igvPorcentaje) {
                document.getElementById('igvPorcentaje').value = formData.igvPorcentaje;
            }
            // Manejar otros cargos - primero cargar el valor
            if (formData.otrosCargos && formData.otrosCargos.monto) {
                document.getElementById('otrosCargos').value = formData.otrosCargos.monto;
            }
    
            // Cargar datos adicionales
            if (formData.numeroComprobanteParte1) {
                document.getElementById('numeroComprobanteParte1').value = formData.numeroComprobanteParte1;
            }
            if (formData.numeroComprobanteParte2) {
                document.getElementById('numeroComprobanteParte2').value = formData.numeroComprobanteParte2;
            }
            if (formData.cuentaContableSearch) {
                document.getElementById('cuentaContableSearch').value = formData.cuentaContableSearch;
            }
    
            // Limpiar solo la tabla de items
            const tbody = document.getElementById('itemsTableBody');
            if (tbody) {
                tbody.innerHTML = '';
            }
    
            // Cargar items uno por uno
            if (formData.items && Array.isArray(formData.items)) {
                formData.items.forEach((item, index) => {
                    // Crear nueva fila
                    const newRow = document.createElement('tr');
                    newRow.innerHTML = `
                        <td>${index + 1}</td>
                        <td><input type="number" step="0.01" class="item-importe" value="${item.importe}" placeholder="Monto sin IGV"></td>
                        <td><input type="number" step="0.01" class="item-porcentaje" value="${item.porcentaje}" placeholder="%"></td>
                        <td><input type="text" class="item-lineaNegocio" value="${item.lineaNegocio}"></td>
                        <td><input type="text" class="item-centroCosto" value="${item.centroCosto}"></td>
                        <td><input type="text" class="item-proyecto" value="${item.proyecto}"></td>
                        <td><button type="button" class="remove-btn" onclick="window.invoiceParser.removeItem(this)">Eliminar</button></td>
                    `;
    
                    // Añadir la fila a la tabla
                    tbody.appendChild(newRow);
    
                    // Crear selects para la nueva fila
                    window.googleSheetsDb.createSelectsForRow(newRow);
    
                    // Establecer valores en los selectores customizados
                    setTimeout(() => {
                        // Línea de Negocio
                        const lineaNegocioSelect = newRow.querySelector('.item-lineaNegocio');
                        if (lineaNegocioSelect && item.lineaNegocio) {
                            lineaNegocioSelect.value = item.lineaNegocio;
                            
                            // Habilitar y establecer Centro de Costo - MODIFICADO PARA MOSTRAR SOLO EL CÓDIGO
                            const centroCostoSearch = newRow.querySelector('.item-centroCosto-search');
                            const centroCostoHidden = newRow.querySelector('.item-centroCosto');
                            if (centroCostoSearch && centroCostoHidden && item.centroCosto) {
                                centroCostoSearch.disabled = false;
                                centroCostoSearch.value = item.centroCosto; // Solo mostrar el código
                                centroCostoHidden.value = item.centroCosto;
                                
                                // Habilitar y establecer Proyecto
                                const proyectoSelect = newRow.querySelector('.item-proyecto');
                                if (proyectoSelect && item.proyecto) {
                                    proyectoSelect.disabled = false;
                                    if (window.googleSheetsDb.ccosData.proyectos.has(item.centroCosto)) {
                                        // Obtener proyectos y sus descripciones
                                        const proyectos = Array.from(window.googleSheetsDb.ccosData.proyectos.get(item.centroCosto));
                                        proyectoSelect.innerHTML = '<option value="00000000000">00000000000</option>';
                                        proyectos.forEach(proyecto => {
                                            const descripcion = window.googleSheetsDb.ccosData.descripcionesProyecto.get(proyecto) || '';
                                            const optionText = descripcion ? `${proyecto} - ${descripcion}` : proyecto;
                                            proyectoSelect.add(new Option(optionText, proyecto));
                                        });
                                        proyectoSelect.value = item.proyecto;
                                    }
                                }
                            }
                        }
                    }, 100);
    
                    // Añadir event listeners para cálculos
                    const importeInput = newRow.querySelector('.item-importe');
                    const porcentajeInput = newRow.querySelector('.item-porcentaje');
                    
                    if (importeInput && porcentajeInput) {
                        importeInput.addEventListener('change', () => window.invoiceParser.updateTotalsAndReferences());
                        porcentajeInput.addEventListener('change', () => window.invoiceParser.updateTotalsAndReferences());
                    }
                });
            }
    
            // Cargar tipo de factura correctamente
            if (formData.tipoFactura) {
                const tipoFacturaSelect = document.getElementById('tipoFactura');
                // Buscar la opción que empiece con el código guardado
                const options = Array.from(tipoFacturaSelect.options);
                const matchingOption = options.find(option => 
                    option.value.startsWith(formData.tipoFactura + ' -') || 
                    option.value === formData.tipoFactura
                );
                if (matchingOption) {
                    tipoFacturaSelect.value = matchingOption.value;
                }
            }
    
            // Calcular totales después de cargar todo
            if (window.invoiceParser.updateTotalsAndReferences) {
                window.invoiceParser.updateTotalsAndReferences();
            }
            
            // Actualizar el totalSuma y la validación después de cargar todos los datos
            setTimeout(() => {
                // Asegurar que los valores estén correctamente cargados
                const baseImponible = parseFloat(document.getElementById('baseImponible').value) || 0;
                const igv = parseFloat(document.getElementById('igv').value) || 0;
                const otrosCargos = parseFloat(document.getElementById('otrosCargos').value) || 0;
                
                // Actualizar el campo totalSuma con todos los componentes
                const totalSuma = baseImponible + igv + otrosCargos;
                document.getElementById('totalSuma').textContent = totalSuma.toFixed(2);
                
                // Actualizar validación
                const validacionTotal = document.getElementById('validacionTotal');
                const totalFactura = parseFloat(document.getElementById('importe').value) || 0;
                
                if (Math.abs(totalSuma - totalFactura) < 0.01) {
                    validacionTotal.textContent = "✓ Los totales coinciden correctamente";
                    validacionTotal.className = "validacion-mensaje validacion-success";
                } else {
                    validacionTotal.textContent = "⚠ Los totales no coinciden. Debe ajustar los valores.";
                    validacionTotal.className = "validacion-mensaje validacion-error";
                }
                
                // Forzar actualización de otros cargos
                if (window.invoiceParser.handleOtrosCargosChange) {
                    window.invoiceParser.handleOtrosCargosChange();
                }
            }, 300); // Pequeño retardo para asegurar que todo esté cargado
    
            // Limpiar el input de archivo para permitir cargar el mismo archivo nuevamente
            event.target.value = '';
        } catch (error) {
            console.error('Error loading form:', error);
            alert('Error al cargar el formulario: ' + error.message);
        }
    }
}

// Crear instancia global
window.formStorage = new FormStorage();

