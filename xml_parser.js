class InvoiceParser {
    constructor() {
        this.namespaces = {
            'cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
            'cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
            'sac': 'urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1'
        };
        
        // Determinar qué proveedor de base de datos usar
        this.dbProvider = window.googleSheetsDb;
        
        this.initializeEventListeners();
        this.initializeComprobanteFormat();
        this.initializeRucValidation();
        this.otrosCargosList = []; 
        this.initializeNewFields();
        this.initializeDesgloseFactura();
        this.initializeDescripcionLimit();
    }

    initializeEventListeners() {
        document.getElementById('xmlFile').addEventListener('change', (e) => this.handleFileUpload(e));
        document.getElementById('invoiceForm').addEventListener('submit', (e) => this.handleFormSubmit(e));
        document.getElementById('addItemBtn').addEventListener('click', () => this.addNewItem());
        document.getElementById('clearFormBtn').addEventListener('click', () => this.clearForm());

        // Nueva función de validación
        const validateForm = () => {
            const form = document.getElementById('invoiceForm');
            if (!form.checkValidity()) {
                form.reportValidity();
                return false;
            }
            return true;
        };

        // Simplificar el manejo de eventos de los botones
        ['exportSolicitudBtn', 'exportERPBtn', 'downloadAllBtn'].forEach(btnId => { // Remover 'saveFormBtn' de aquí
            document.getElementById(btnId).addEventListener('click', (e) => {
                e.preventDefault();
                const form = document.getElementById('invoiceForm');
                // Solo disparar la acción si el formulario es válido
                if (form.checkValidity()) {
                    switch(btnId) {
                        case 'exportSolicitudBtn':
                            window.excelExporter.exportSolicitud();
                            break;
                        case 'exportERPBtn':
                            window.excelExporter.exportERP();
                            break;
                        case 'downloadAllBtn':
                                window.exportAllManager.downloadAll();
                                break;
                    }
                } else {
                    form.reportValidity();
                }
            });
        });
    }

    initializeDescripcionLimit() {
        const descripcionField = document.getElementById('descripcion');
        if (descripcionField) {
            // Establecer límite de 25 caracteres
            descripcionField.setAttribute('maxlength', '25');
            
            // Añadir contador de caracteres
            const counterSpan = document.createElement('span');
            counterSpan.className = 'character-counter';
            counterSpan.style.cssText = 'float: right; font-size: 12px; color: #6c757d; margin-top: 5px;';
            
            const updateCounter = () => {
                const currentLength = descripcionField.value.length;
                counterSpan.textContent = `${currentLength}/25`;
                
                // Cambiar color cuando se acerca al límite
                if (currentLength >= 20) {
                    counterSpan.style.color = '#dc3545';
                } else {
                    counterSpan.style.color = '#6c757d';
                }
            };
            
            // Inicializar contador
            updateCounter();
            
            // Añadir el contador después del campo
            descripcionField.parentNode.appendChild(counterSpan);
            
            // Actualizar el contador cuando cambia el contenido
            descripcionField.addEventListener('input', updateCounter);
        }
    }

    initializeComprobanteFormat() {
        const parte1 = document.getElementById('numeroComprobanteParte1');
        const parte2 = document.getElementById('numeroComprobanteParte2');
        const numeroComprobanteCompleto = document.getElementById('numeroComprobante');

        const handleParte1 = (input) => {
            // Limitar a 4 caracteres
            input.value = input.value.slice(0, 4);
            actualizarComprobanteCompleto();
        };

        // Nueva función para manejar parte2
        const handleParte2KeyDown = (e) => {
            // Solo permitir números y backspace
            if (!((e.key >= '0' && e.key <= '9') || e.key === 'Backspace')) {
                e.preventDefault();
                return;
            }
            
            let currentValue = parte2.value.replace(/[^1-9]/g, ''); // Solo considerar números no-cero
            
            if (e.key === 'Backspace') {
                currentValue = currentValue.slice(0, -1);
            } else {
                if (currentValue.length >= 8 && e.key !== '0') {
                    e.preventDefault();
                    return;
                }
                currentValue = currentValue + e.key;
            }
            
            // Rellenar con ceros a la izquierda
            parte2.value = currentValue.padStart(8, '0');
            actualizarComprobanteCompleto();
            
            // Prevenir el comportamiento default
            e.preventDefault();
        };

        // Inicializar parte2 con ceros
        parte2.value = '00000000';

        const actualizarComprobanteCompleto = () => {
            numeroComprobanteCompleto.value = `${parte1.value}-${parte2.value}`;
        };

        // Eventos para parte1
        parte1.addEventListener('input', () => handleParte1(parte1));

        // Eventos para parte2
        parte2.addEventListener('keydown', handleParte2KeyDown);

        // Asegurar formato al cargar datos del XML
        parte2.addEventListener('change', () => {
            let value = parte2.value.replace(/[^0-9]/g, '');
            parte2.value = value.padStart(8, '0');
            actualizarComprobanteCompleto();
        });
    }

    initializeRucValidation() {
        const rucInput = document.getElementById('ruc');
        
        // Prevenir entrada de caracteres no numéricos
        rucInput.addEventListener('keypress', (e) => {
            if (!/^\d$/.test(e.key)) {
                e.preventDefault();
                return;
            }
            // Prevenir si ya tiene 11 dígitos
            if (rucInput.value.length >= 11) {
                e.preventDefault();
            }
        });

        // Limpiar caracteres no numéricos en caso de pegar texto
        rucInput.addEventListener('input', () => {
            rucInput.value = rucInput.value.replace(/\D/g, '').slice(0, 11);
        });
    }

    getInvoiceId(xmlDoc) {
        // Primero intentamos obtener el ID directamente bajo Invoice
        let id = null;
        
        // Buscar todos los elementos ID
        const idElements = xmlDoc.getElementsByTagNameNS("*", "ID");
        
        for (let element of idElements) {
            // Verificar si es hijo directo de Invoice o está en la posición correcta
            if (element.parentNode === xmlDoc.documentElement) {
                // Verificar que no sea parte de Signature o AccountingSupplierParty
                let parent = element.parentNode;
                let isValid = true;
                while (parent) {
                    if (parent.localName === "Signature" || 
                        parent.localName === "AccountingSupplierParty" ||
                        parent.localName === "DigitalSignatureAttachment") {
                        isValid = false;
                        break;
                    }
                    parent = parent.parentNode;
                }
                if (isValid) {
                    id = element.textContent;
                    break;
                }
            }
        }
        
        return id ? id.trim() : '';
    }

    clearForm() {
        if (confirm('¿Estás seguro que deseas limpiar todo el formulario? Esta acción no se puede deshacer.')) {
            // Limpiar el input de archivo
            document.getElementById('xmlFile').value = '';
            
            // Limpiar todos los inputs del formulario
            document.getElementById('invoiceForm').reset();
            
            // Limpiar los nuevos campos de desglose
            document.getElementById('baseImponible').value = '';
            document.getElementById('igv').value = '';
            document.getElementById('otrosCargos').value = '';
            document.getElementById('totalSuma').textContent = '0.00';
            document.getElementById('validacionTotal').textContent = '';
            document.getElementById('validacionTotal').className = 'validacion-mensaje';
            
            // Limpiar la tabla de items
            this.clearItems();
        }
    }

    async handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(text, "text/xml");
            
            const invoiceData = this.parseInvoiceXML(xmlDoc);
            this.populateForm(invoiceData);
        } catch (error) {
            console.error('Error processing XML file:', error);
            alert('Error al procesar el archivo XML');
        }
    }

    getElementValue(xmlDoc, elementName, parentElement = null) {
        const searchContext = parentElement || xmlDoc;
        const elements = searchContext.getElementsByTagNameNS("*", elementName);
        return elements.length > 0 ? elements[0].textContent.trim() : '';
    }

    getElements(xmlDoc, elementName) {
        return xmlDoc.getElementsByTagNameNS("*", elementName);
    }

    handleFormSubmit(event) {
        event.preventDefault();
        const formData = this.collectFormData();
        // Aquí puedes agregar la lógica para enviar los datos
    }

    getInvoiceId(xmlDoc) {
        const cbcIdElements = xmlDoc.getElementsByTagNameNS("urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2", "ID");
        
        // Buscar el ID que es hijo directo de Invoice
        for (let element of cbcIdElements) {
            if (element.parentNode.localName === "Invoice") {
                return element.textContent.trim();
            }
        }
        
        return '';
    }

    parseInvoiceXML(xmlDoc) {
        try {
            const invoiceId = this.getInvoiceId(xmlDoc);
            
            let parte1 = '', parte2 = '';
            if (invoiceId) {
                const parts = invoiceId.split('-');
                
                if (parts.length === 2) {
                    parte1 = parts[0];
                    // Limpiar y rellenar con ceros
                    parte2 = parts[1].replace(/\D/g, '').padStart(8, '0');
                }
            }

            // Obtener el importe total con IGV
            let importe = this.getElementValue(xmlDoc, "TaxInclusiveAmount");
            if (!importe) {
                importe = this.getElementValue(xmlDoc, "PayableAmount");
            }

            // Obtener valores para desglose
            const baseImponible = this.getElementValue(xmlDoc, "TaxableAmount") || this.getElementValue(xmlDoc, "LineExtensionAmount");
            const igv = this.getElementValue(xmlDoc, "TaxAmount");

            // Resto de la lógica para obtener otros campos...
            const result = {
                ruc: this.getElementValue(xmlDoc, "ID", xmlDoc.querySelector("*|AccountingSupplierParty")),
                razonSocial: this.getElementValue(xmlDoc, "RegistrationName"),
                moneda: this.standardizeCurrency(this.getElementValue(xmlDoc, "DocumentCurrencyCode")),
                tipoFacturaNacionalidad: 'nacional',
                tipoMoneda: '',
                fechaEmision: this.getElementValue(xmlDoc, "IssueDate"),
                numeroComprobanteParte1: parte1,
                numeroComprobanteParte2: parte2,
                numeroComprobante: `${parte1}-${parte2}`,
                importe: this.getElementValue(xmlDoc, "PayableAmount") || this.getElementValue(xmlDoc, "TaxInclusiveAmount"),
                baseImponible: baseImponible,
                igv: igv,
                solicitante: '',
                descripcion: '',
                fechaInicioLicencia: '',
                fechaFinLicencia: '',
                areaSolicitante: '',
                items: []
            };

            if (result.moneda === 'PEN') {
                result.tipoMoneda = 'SOLES-NACIONAL';
            } else if (result.moneda === 'USD') {
                result.tipoMoneda = 'DOLARES-NACIONAL'; // Asumimos nacional por defecto
            }


            return result;

        } catch (error) {
            console.error('Error parsing XML:', error);
            throw new Error('Failed to parse XML invoice');
        }
    }

    parseInvoiceItems(xmlDoc, totalImporte) {
        const items = [];
        const invoiceLines = this.getElements(xmlDoc, "InvoiceLine");
        const totalAmount = parseFloat(totalImporte) || 0;
    
        for (let i = 0; i < invoiceLines.length; i++) {
            const line = invoiceLines[i];
            
            // Intentar obtener el precio con IGV primero
            let priceAmount = this.getElementValue(line, "PriceAmount");
            const quantity = parseFloat(this.getElementValue(line, "InvoicedQuantity")) || 1;
            
            // Si no encontramos el precio con IGV, buscamos en AlternativeConditionPrice
            if (!priceAmount) {
                priceAmount = this.getElementValue(line, "AlternativeConditionPrice/PriceAmount");
            }
            
            const itemAmount = parseFloat(priceAmount) * quantity;
    
            items.push({
                numeroItem: i + 1,
                importe: itemAmount.toFixed(2),
                porcentaje: totalAmount ? ((itemAmount / totalAmount) * 100).toFixed(2) : '0',
                lineaNegocio: '',
                centroCosto: '',
                proyecto: ''
            });
        }
    
        return items;
    }

    getDetractionPercentage(xmlDoc) {
        const paymentTerms = Array.from(this.getElements(xmlDoc, "PaymentTerms"));
        for (const term of paymentTerms) {
            const id = this.getElementValue(term, "ID");
            if (id === "Detraccion") {
                return this.getElementValue(term, "PaymentPercent");
            }
        }
        return '';
    }

    getXMLValue(xmlDoc, xpath, defaultValue = '') {
        try {
            const result = xmlDoc.evaluate(
                xpath,
                xmlDoc,
                this.createNSResolver(),
                XPathResult.STRING_TYPE,
                null
            );
            return result.stringValue.trim() || defaultValue;
        } catch (error) {
            console.error('Error getting XML value:', error);
            return defaultValue;
        }
    }

    createNSResolver() {
        return prefix => this.namespaces[prefix] || null;
    }

    standardizeCurrency(currencyText) {
        if (!currencyText) return '';
        currencyText = currencyText.toUpperCase();
        if (currencyText.includes('SOL') || currencyText === 'PEN') return 'PEN';
        if (currencyText.includes('DOLAR') || currencyText === 'USD') return 'USD';
        return currencyText;
    }

    populateForm(data) {
        // Crear una lista de campos que NO deben ser autocompletados
        const excludeFields = [
            'porcentajeDetraccion',
            'codigoBien',
            'cuentaContable',
            'tipoFactura',
            'razonSocial', // Añadido para excluir específicamente este campo
        ];

        // Poblar solo los campos que no están en la lista de exclusión
        for (const [key, value] of Object.entries(data)) {
            if (!excludeFields.includes(key)) {
                const element = document.getElementById(key);
                if (element) element.value = value;
            }
        }

        if (data.ruc) {
            document.getElementById('ruc').value = data.ruc;
            
            // Simplemente establecer el valor del RUC en el campo de búsqueda
            document.getElementById('rucSearch').value = data.ruc;
        }

        // Manejar específicamente el número de comprobante
        if (data.numeroComprobanteParte1) {
            document.getElementById('numeroComprobanteParte1').value = data.numeroComprobanteParte1;
        }
        if (data.numeroComprobanteParte2) {
            const parte2 = data.numeroComprobanteParte2.padStart(8, '0');
            document.getElementById('numeroComprobanteParte2').value = parte2;
        }
        if (data.numeroComprobante) {
            document.getElementById('numeroComprobante').value = data.numeroComprobante;
        }

        // Rellenar campos de desglose
        if (data.baseImponible) {
            document.getElementById('baseImponible').value = data.baseImponible;
            // Calcular IGV automáticamente (18%)
            const baseImponible = parseFloat(data.baseImponible) || 0;
            document.getElementById('igv').value = (baseImponible * 0.18).toFixed(2);
        }

        // Limpiar items existentes y agregar nueva fila
        this.clearItems();

        // Manejar el número de comprobante
        if (data.numeroComprobante) {
            const [parte1, parte2] = data.numeroComprobante.split('-');
            document.getElementById('numeroComprobanteParte1').value = parte1 || '';
            document.getElementById('numeroComprobanteParte2').value = parte2 || '';
            document.getElementById('numeroComprobante').value = data.numeroComprobante;
        }

        // Actualizar los totales
        this.updateTotalsAndReferences();
    }

    clearItems() {
        const tbody = document.getElementById('itemsTableBody');
        tbody.innerHTML = '';
    }

    addNewItem(itemData = null) {
        const tbody = document.getElementById('itemsTableBody');
        
        // Usar la base imponible en vez del importe total para los cálculos
        const baseImponible = parseFloat(document.getElementById('baseImponible').value) || 0;
        
        // Obtener índice correcto contando solo las filas de items
        const itemRows = tbody.querySelectorAll('tr:not(#totalRow):not(#importeSinIGVRow):not(#importeConIGVRow)');
        const rowIndex = itemRows.length + 1;
    
        const newRow = document.createElement('tr');
        newRow.innerHTML = `
            <td>${rowIndex}</td>
            <td><input type="number" step="0.01" class="item-importe" value="${itemData?.importe || ''}" placeholder="Monto sin IGV"></td>
            <td><input type="number" step="0.01" class="item-porcentaje" value="${itemData?.porcentaje || ''}" placeholder="%"></td>
            <td></td>
            <td></td>
            <td></td>
            <td><button type="button" class="remove-btn" onclick="window.invoiceParser.removeItem(this)">Eliminar</button></td>
        `;
        
        // Insertar la nueva fila antes de la fila de totales si existe
        const totalRow = document.getElementById('totalRow');
        if (totalRow) {
            tbody.insertBefore(newRow, totalRow);
        } else {
            tbody.appendChild(newRow);
        }
    
        // Usar el proveedor de base de datos detectado (googleSheetsDb)
        if (window.googleSheetsDb) {
            window.googleSheetsDb.createSelectsForRow(newRow);
        } else {
            console.error('No se encontró un proveedor de base de datos válido para createSelectsForRow');
        }
        
        // Agregar eventos a los campos
        const importeInput = newRow.querySelector('.item-importe');
        const porcentajeInput = newRow.querySelector('.item-porcentaje');
    
        // Establecer valores iniciales solo si se proporcionaron datos
        if (itemData) {
            porcentajeInput.value = itemData.porcentaje || '';
            importeInput.value = itemData.importe || '';
        }
        // Eliminamos el código que asigna 100% al primer item
        
        // Añadir un evento para que al menos actualice los totales cuando cambia el porcentaje
        porcentajeInput.addEventListener('input', () => {
            this.updateTotalsAndReferences();
        });
    
        importeInput.addEventListener('input', () => {
            const importe = parseFloat(importeInput.value) || 0;
            // Usar base imponible en lugar de importeSinIGV para el cálculo del porcentaje
            const nuevoPorcentaje = baseImponible > 0 ? (importe / baseImponible * 100) : 0;
            porcentajeInput.value = nuevoPorcentaje.toFixed(2);
            this.updateTotalsAndReferences();
        });
        
        // Añadir evento de cambio para el selector de proyecto
        const proyectoSelect = newRow.querySelector('.item-proyecto');
        if (proyectoSelect) {
            proyectoSelect.addEventListener('change', () => {
                // Actualizar otros cargos cuando cambia el proyecto
                this.handleOtrosCargosChange();
            });
        }
    
        this.updateTotalsAndReferences();
    }

    updateTotalsAndReferences() {
        const tbody = document.getElementById('itemsTableBody');
        const importeTotal = parseFloat(document.getElementById('importe').value) || 0;
        
        // Usar valores del desglose si están disponibles
        const baseImponibleInput = document.getElementById('baseImponible');
        const baseImponible = parseFloat(baseImponibleInput.value) || 0;
        const importeSinIGV = baseImponible;
    
        // Remover filas de totales existentes si hay
        ['totalRow', 'importeSinIGVRow', 'importeConIGVRow'].forEach(id => {
            const existingRow = document.getElementById(id);
            if (existingRow) {
                existingRow.remove();
            }
        });
    
        // Calcular sumas solo de las filas de items
        const items = tbody.querySelectorAll('tr:not(.total-row):not(#totalRow):not(#importeSinIGVRow):not(#importeConIGVRow)');
        let sumImportes = 0;
        let sumPorcentajes = 0;
    
        items.forEach(row => {
            const importeInput = row.querySelector('.item-importe');
            const porcentajeInput = row.querySelector('.item-porcentaje');
            if (importeInput && porcentajeInput) {
                sumImportes += parseFloat(importeInput.value) || 0;
                sumPorcentajes += parseFloat(porcentajeInput.value) || 0;
            }
        });
    
        // Crear y agregar fila de totales
        const totalRow = document.createElement('tr');
        totalRow.id = 'totalRow';
        totalRow.classList.add('total-row');
        totalRow.innerHTML = `
            <td><strong>Total:</strong></td>
            <td class="text-right"><strong>${sumImportes.toFixed(2)}</strong></td>
            <td class="text-right"><strong>${sumPorcentajes.toFixed(2)}%</strong></td>
            <td colspan="4"></td>
        `;
        tbody.appendChild(totalRow);
    
        // Agregar filas de referencia
        const importeSinIGVRow = document.createElement('tr');
        importeSinIGVRow.id = 'importeSinIGVRow';
        importeSinIGVRow.classList.add('reference-row');
        importeSinIGVRow.innerHTML = `
            <td><strong>Base Imponible:</strong></td>
            <td class="text-right">${importeSinIGV.toFixed(2)}</td>
            <td colspan="5"></td>
        `;
        tbody.appendChild(importeSinIGVRow);
    
        const importeConIGVRow = document.createElement('tr');
        importeConIGVRow.id = 'importeConIGVRow';
        importeConIGVRow.classList.add('reference-row');
        importeConIGVRow.innerHTML = `
            <td><strong>Importe CON IGV:</strong></td>
            <td class="text-right">${importeTotal.toFixed(2)}</td>
            <td colspan="5"></td>
        `;
        tbody.appendChild(importeConIGVRow);
    
        // Después de actualizar los totales, actualizar otros cargos si existe un valor
        const otrosCargos = parseFloat(document.getElementById('otrosCargos').value);
        if (!isNaN(otrosCargos) && otrosCargos > 0) {
            // Forzar una actualización completa de la lista de otros cargos
            this.handleOtrosCargosChange();
        }
    }

    removeItem(button) {
        const row = button.closest('tr');
        row.remove();
        this.renumberItems();
        this.updateTotalsAndReferences();
    }

    renumberItems() {
        const tbody = document.getElementById('itemsTableBody');
        const rows = tbody.getElementsByTagName('tr');
        let itemNumber = 1;
    
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            // Solo renumerar si no es una fila de totales o referencias
            if (!row.id && !row.classList.contains('total-row')) {
                row.cells[0].textContent = itemNumber++;
            }
        }
    }

    updateItemPercentages() {
        const totalImporte = parseFloat(document.getElementById('importe').value) || 0;
        if (totalImporte <= 0) return;
    
        // Remover la fila de total existente si hay una
        const existingTotalRow = document.getElementById('totalRow');
        if (existingTotalRow) {
            existingTotalRow.remove();
        }
    
        const items = document.getElementsByClassName('item-importe');
        let sumImportes = 0;
        let sumPorcentajes = 0;
        
        for (let item of items) {
            const itemImporte = parseFloat(item.value) || 0;
            const porcentaje = (itemImporte / totalImporte) * 100;
            const porcentajeInput = item.closest('tr').querySelector('.item-porcentaje');
            
            if (porcentajeInput) {
                porcentajeInput.value = porcentaje.toFixed(2);
            }
            
            sumImportes += itemImporte;
            sumPorcentajes += porcentaje;
        }
    
        // Crear y agregar la fila de totales al final
        const tbody = document.getElementById('itemsTableBody');
        const totalRow = document.createElement('tr');
        totalRow.id = 'totalRow';
        totalRow.classList.add('total-row');
        totalRow.innerHTML = `
            <td><strong>Total</strong></td>
            <td><input type="number" class="total-amount" readonly value="${sumImportes.toFixed(2)}"></td>
            <td><input type="number" class="total-percentage" readonly value="${sumPorcentajes.toFixed(2)}"></td>
            <td colspan="4"></td>
        `;
        tbody.appendChild(totalRow);
    }

    collectFormData() {
        const formData = {
            basic: {},
            items: []
        };
    
        // Lista de campos básicos a recolectar
        const basicFields = [
            'ruc', 'razonSocial', 'moneda', 'fechaEmision', 'numeroComprobante',
            'importe', 'solicitante', 'tipoFacturaNacionalidad', 'tipoMoneda',
            'descripcion', 'codigoBien', 'porcentajeDetraccion', 'fechaInicioLicencia',
            'fechaFinLicencia', 'areaSolicitante'
        ];
    
        // Recolectar datos básicos con validación
        basicFields.forEach(field => {
            const element = document.getElementById(field);
            if (element) {
                formData.basic[field] = element.value || '';
            } else {
                formData.basic[field] = '';
                console.warn(`Campo ${field} no encontrado en el formulario`);
            }
        });
        
        formData.basic.numeroComprobante = document.getElementById('numeroComprobante').value;
        // Añadir campos de desglose
        formData.baseImponible = document.getElementById('baseImponible').value || '';
        formData.igv = document.getElementById('igv').value || '';
        formData.igvPorcentaje = document.getElementById('igvPorcentaje').value || '18';

        // Recolectar solo las filas de items (excluyendo las filas de totales y referencias)
        const tbody = document.getElementById('itemsTableBody');
        if (tbody) {
            const rows = tbody.getElementsByTagName('tr');
            for (let row of rows) {
                // Excluir las filas de totales y referencias
                if (!row.id && !row.id?.includes('total') && !row.id?.includes('importe')) {
                    const importeInput = row.querySelector('.item-importe');
                    const porcentajeInput = row.querySelector('.item-porcentaje');
                    const lineaNegocioInput = row.querySelector('.item-lineaNegocio');
                    const centroCostoInput = row.querySelector('.item-centroCosto');
                    const proyectoInput = row.querySelector('.item-proyecto');
                    const centroCosto = centroCostoInput?.value || '';

                     // Asegurar que se obtiene solo el código del proyecto
                    let proyecto = proyectoInput?.value || '00000000000';
                    proyecto = extractProyectoCode(proyecto);

                    if (importeInput) { // Si existe el input de importe, es una fila de item válida
                        const item = {
                            numeroItem: formData.items.length + 1,
                            importe: importeInput.value || '0',
                            porcentaje: porcentajeInput?.value || '0',
                            lineaNegocio: lineaNegocioInput?.value || '',
                            centroCosto: centroCosto,
                            proyecto: proyecto
                        };
                        formData.items.push(item);
                    }
                }
            }
        }

        // Agregar otros cargos si existen
        if (this.otrosCargosList.length > 0) {
            // Procesar la lista de otros cargos para asegurar que los proyectos estén en el formato correcto
            const processedOtrosCargos = this.otrosCargosList.map(item => {
                return {
                    ...item,
                    proyecto: extractProyectoCode(item.proyecto)
                };
            });
            
            formData.otrosCargos = {
                monto: document.getElementById('otrosCargos').value,
                items: processedOtrosCargos
            };
        }

        // Extraer solo el código de la cuenta contable
        const cuentaContableValue = document.getElementById('cuentaContableSearch').value;
        formData.cuentaContableSearch = cuentaContableValue.split(' - ')[0];

        return formData;
    }

    initializeDesgloseFactura() {
        const baseImponibleInput = document.getElementById('baseImponible');
        const igvInput = document.getElementById('igv');
        const igvPorcentajeSelect = document.getElementById('igvPorcentaje');
        const otrosCargosInput = document.getElementById('otrosCargos');
        const totalSumaSpan = document.getElementById('totalSuma');
        const importeInput = document.getElementById('importe');
        const validacionTotal = document.getElementById('validacionTotal');
        const recalcularBtn = document.getElementById('recalcularBtn');
    
        // Función para calcular totales
        const calcularTotales = () => {
            const baseImponible = parseFloat(baseImponibleInput.value) || 0;
            // Modificar esta línea para manejar correctamente el 0%
            const igvPorcentaje = parseFloat(igvPorcentajeSelect.value);
            // El resto sigue igual
            const igv = parseFloat(igvInput.value) || 0;
            const otrosCargos = parseFloat(otrosCargosInput.value) || 0;
            
            // Calcular suma total
            const suma = baseImponible + igv + otrosCargos;
            totalSumaSpan.textContent = suma.toFixed(2);
            
            // Validar si coincide con el total factura
            const totalFactura = parseFloat(importeInput.value) || 0;
            
            if (Math.abs(suma - totalFactura) < 0.01) {
                validacionTotal.textContent = "✓ Los totales coinciden correctamente";
                validacionTotal.className = "validacion-mensaje validacion-success";
            } else {
                validacionTotal.textContent = "⚠ Los totales no coinciden. Debe ajustar los valores.";
                validacionTotal.className = "validacion-mensaje validacion-error";
            }
            
            // Actualizar la tabla de referencia
            this.updateTotalsAndReferences();
        };
        
        // Calcular IGV automáticamente cuando cambia la base imponible o el porcentaje
        const actualizarIGV = () => {
            const baseImponible = parseFloat(baseImponibleInput.value) || 0;
            // Asegurarnos de usar igvPorcentaje como está, sin || fallback
            const igvPorcentaje = parseFloat(igvPorcentajeSelect.value);
            // Actualizar el valor del IGV
            igvInput.value = (baseImponible * igvPorcentaje / 100).toFixed(2);
            calcularTotales();
            
            // Actualizar los importes de los items según sus porcentajes
            this.updateItemImportes(baseImponible);
        };
        
        baseImponibleInput.addEventListener('input', actualizarIGV);
        igvPorcentajeSelect.addEventListener('change', actualizarIGV);
        
        // Recalcular suma cuando cambia cualquier valor
        igvInput.addEventListener('input', calcularTotales);
        otrosCargosInput.addEventListener('input', calcularTotales);
        importeInput.addEventListener('input', calcularTotales);
        
        recalcularBtn.addEventListener('click', () => {
            const totalFactura = parseFloat(importeInput.value) || 0;
            const otrosCargos = parseFloat(otrosCargosInput.value) || 0;
            // Corrección aquí también para igvPorcentaje
            const igvPorcentaje = parseFloat(igvPorcentajeSelect.value);
            
            // Si no hay total factura, no podemos calcular
            if (totalFactura <= 0) {
                alert('Debe ingresar un Total Factura válido para recalcular');
                return;
            }
            
            // Prevenir división por cero cuando igvPorcentaje es 0
            const divisor = igvPorcentaje === 0 ? 1 : (1 + igvPorcentaje/100);
            // Calcular la base imponible necesaria para que cuadre
            const baseCalculada = (totalFactura - otrosCargos) / divisor;
            
            if (baseCalculada < 0) {
                alert('El valor de Otros Cargos es mayor que el Total Factura. Por favor, ajuste los valores.');
                return;
            }
            
            baseImponibleInput.value = baseCalculada.toFixed(2);
            igvInput.value = (baseCalculada * igvPorcentaje / 100).toFixed(2);
            calcularTotales();
            
            // Añadir esta línea para actualizar los importes de los items
            this.updateItemImportes(baseCalculada);
        });
    }
    
        updateItemImportes(baseImponible) {
            const tbody = document.getElementById('itemsTableBody');
            const items = tbody.querySelectorAll('tr:not(.total-row):not(#totalRow):not(#importeSinIGVRow):not(#importeConIGVRow)');
            
            items.forEach(row => {
                const importeInput = row.querySelector('.item-importe');
                const porcentajeInput = row.querySelector('.item-porcentaje');
                
                if (importeInput && porcentajeInput) {
                    const importe = parseFloat(importeInput.value) || 0;
                    // Actualizar solo el porcentaje según el importe existente
                    const nuevoPorcentaje = baseImponible > 0 ? (importe / baseImponible * 100) : 0;
                    porcentajeInput.value = nuevoPorcentaje.toFixed(2);
                }
            });
            
            // Actualizar los totales y referencias después de modificar los items
            this.updateTotalsAndReferences();
        }
    
        initializeNewFields() {
            const cantidadItemsInput = document.getElementById('cantidadItems');
            const otrosCargosInput = document.getElementById('otrosCargos');
    
            cantidadItemsInput.addEventListener('input', () => this.handleCantidadItemsChange());
            otrosCargosInput.addEventListener('input', () => this.handleOtrosCargosChange());
        }
    
        handleCantidadItemsChange() {
            const cantidadItems = parseInt(document.getElementById('cantidadItems').value);
            if (!cantidadItems || isNaN(cantidadItems)) return;
        
            this.clearItems(); // Limpiar items existentes
            
            // Obtener la base imponible actual
            const baseImponible = parseFloat(document.getElementById('baseImponible').value) || 0;
            
            // Dividir el importe por ítem equitativamente
            const importePorItem = baseImponible / cantidadItems;
            
            // Crear exactamente el número de ítems solicitados
            for (let i = 0; i < cantidadItems; i++) {
                // Añadir el ítem con el importe calculado
                const newItem = this.addNewItem({
                    importe: importePorItem.toFixed(2)
                });
            }
            
            // IMPORTANTE: Actualizar los porcentajes manualmente después de crear los ítems
            const tbody = document.getElementById('itemsTableBody');
            const items = tbody.querySelectorAll('tr:not(.total-row):not(#totalRow):not(#importeSinIGVRow):not(#importeConIGVRow)');
            
            items.forEach(row => {
                const importeInput = row.querySelector('.item-importe');
                const porcentajeInput = row.querySelector('.item-porcentaje');
                
                if (importeInput && porcentajeInput) {
                    const importe = parseFloat(importeInput.value) || 0;
                    // Calcular el porcentaje basado en el importe y la base imponible
                    const nuevoPorcentaje = baseImponible > 0 ? (importe / baseImponible * 100) : 0;
                    porcentajeInput.value = nuevoPorcentaje.toFixed(2);
                }
            });
            
            // Actualizar totales y referencias después de modificar todos los ítems
            this.updateTotalsAndReferences();
            
            // Actualizar otros cargos después de crear los nuevos items
            this.handleOtrosCargosChange();
        }
    
        handleOtrosCargosChange() {
            const otrosCargos = parseFloat(document.getElementById('otrosCargos').value);
            if (!otrosCargos || isNaN(otrosCargos)) {
                this.otrosCargosList = [];
                return;
            }
        
            const itemsActuales = Array.from(document.querySelectorAll('#itemsTableBody tr:not(.total-row):not([id])'));
            
            // Obtenemos los valores actuales directamente de la interfaz
            this.otrosCargosList = itemsActuales.map(row => {
                const porcentaje = parseFloat(row.querySelector('.item-porcentaje').value) || 0;
                const importeProporcional = (otrosCargos * porcentaje / 100).toFixed(2);
                
                // Obtener los valores actuales de los selects
                const lineaNegocioValue = row.querySelector('.item-lineaNegocio').value || '';
                const centroCostoValue = row.querySelector('.item-centroCosto').value || '';
                
                // Importante: Obtener el valor ACTUAL del select de proyecto
                const proyectoSelect = row.querySelector('.item-proyecto');
                const proyectoValue = proyectoSelect ? proyectoSelect.value : '00000000000';
                
                
                return {
                    importe: importeProporcional,
                    porcentaje: porcentaje,
                    lineaNegocio: lineaNegocioValue,
                    centroCosto: centroCostoValue,
                    proyecto: proyectoValue // Usamos el valor actual del select
                };
            });
            
            console.log('Lista actualizada de otros cargos:', this.otrosCargosList);
        }
    
        updateOtrosCargosList(items, otrosCargos) {
            this.otrosCargosList = items.map(row => {
                const porcentaje = parseFloat(row.querySelector('.item-porcentaje').value) || 0;
                const importeProporcional = (otrosCargos * porcentaje / 100).toFixed(2);
                
                return {
                    importe: importeProporcional,
                    porcentaje: porcentaje,
                    lineaNegocio: row.querySelector('.item-lineaNegocio').value || '',
                    centroCosto: row.querySelector('.item-centroCosto')?.value || '',
                    proyecto: row.querySelector('.item-proyecto').value || '00000000000'
                };
            });
        }
    
        
    }
    
    function extractProyectoCode(proyectoValue) {
        // Si el proyecto tiene formato "código - descripción", extraer solo el código
        if (proyectoValue && proyectoValue.includes(' - ')) {
            return proyectoValue.split(' - ')[0].trim();
        }
        return proyectoValue || '00000000000';
    }
    
    // Crear instancia global para acceso desde HTML
    window.invoiceParser = new InvoiceParser();