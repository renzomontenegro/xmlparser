class InvoiceParser {
    constructor() {
        this.namespaces = {
            'cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
            'cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
            'sac': 'urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1'
        };
        this.initializeEventListeners();
        this.initializeComprobanteFormat();
        this.initializeRucValidation();
        this.otrosCargosList = []; // Añadir esta propiedad
        this.initializeNewFields();
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
                            window.exportAll.downloadAll();
                            break;
                    }
                } else {
                    form.reportValidity();
                }
            });
        });
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
            
            // Limpiar la tabla de items
            this.clearItems();
            
            // Agregar una fila vacía en la tabla de items
            this.addNewItem();
    
            // Opcional: Mostrar mensaje de éxito
            alert('El formulario ha sido limpiado exitosamente.');
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

            // Resto de la lógica para obtener otros campos...
            const result = {
                ruc: this.getElementValue(xmlDoc, "ID", xmlDoc.querySelector("*|AccountingSupplierParty")),
                razonSocial: this.getElementValue(xmlDoc, "RegistrationName"),
                moneda: this.standardizeCurrency(this.getElementValue(xmlDoc, "DocumentCurrencyCode")),
                fechaEmision: this.getElementValue(xmlDoc, "IssueDate"),
                numeroComprobanteParte1: parte1,
                numeroComprobanteParte2: parte2,
                numeroComprobante: `${parte1}-${parte2}`,
                importe: this.getElementValue(xmlDoc, "PayableAmount") || this.getElementValue(xmlDoc, "TaxInclusiveAmount"),
                solicitante: '',
                descripcion: '',
                fechaInicioLicencia: '',
                fechaFinLicencia: '',
                areaSolicitante: '',
                items: []
            };

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

    parseInvoiceItems(xmlDoc) {
        const items = [];
        const invoiceLines = this.getElements(xmlDoc, "InvoiceLine");
        const totalAmount = parseFloat(this.getElementValue(xmlDoc, "PayableAmount")) || 0;

        for (let i = 0; i < invoiceLines.length; i++) {
            const line = invoiceLines[i];
            const priceAmount = this.getElementValue(line, "PriceAmount");
            const quantity = parseFloat(this.getElementValue(line, "InvoicedQuantity")) || 1;
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
        ];

        // Poblar solo los campos que no están en la lista de exclusión
        for (const [key, value] of Object.entries(data)) {
            if (!excludeFields.includes(key)) {
                const element = document.getElementById(key);
                if (element) element.value = value;
            }
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

        // Limpiar items existentes y agregar nueva fila
        this.clearItems();
        this.addNewItem();

        // Manejar el número de comprobante
        if (data.numeroComprobante) {
            const [parte1, parte2] = data.numeroComprobante.split('-');
            document.getElementById('numeroComprobanteParte1').value = parte1 || '';
            document.getElementById('numeroComprobanteParte2').value = parte2 || '';
            document.getElementById('numeroComprobante').value = data.numeroComprobante;
        }
    }

    clearItems() {
        const tbody = document.getElementById('itemsTableBody');
        tbody.innerHTML = '';
    }

    addNewItem(itemData = null) {
        const tbody = document.getElementById('itemsTableBody');
        const importeTotal = parseFloat(document.getElementById('importe').value) || 0;
        const importeSinIGV = importeTotal / 1.18;
        
        // Obtener índice correcto contando solo las filas de items
        const itemRows = tbody.querySelectorAll('tr:not(#totalRow):not(#importeSinIGVRow):not(#importeConIGVRow)');
        const rowIndex = itemRows.length + 1;
    
        const newRow = document.createElement('tr');
        newRow.innerHTML = `
            <td>${rowIndex}</td>
            <td><input type="number" step="0.01" class="item-importe" value="${itemData?.importe || ''}" placeholder="Monto sin IGV"></td>
            <td><input type="number" step="0.01" class="item-porcentaje" value="${itemData?.porcentaje || ''}" placeholder="%"></td>
            <td><input type="text" class="item-lineaNegocio" value="${itemData?.lineaNegocio || ''}"></td>
            <td><input type="text" class="item-centroCosto" value="${itemData?.centroCosto || ''}"></td>
            <td><input type="text" class="item-proyecto" value="${itemData?.proyecto || ''}"></td>
            <td><button type="button" class="remove-btn" onclick="window.invoiceParser.removeItem(this)">Eliminar</button></td>
        `;
        
        window.excelDb.createSelectsForRow(newRow);
        
        // Insertar la nueva fila antes de la fila de totales si existe
        const totalRow = document.getElementById('totalRow');
        if (totalRow) {
            tbody.insertBefore(newRow, totalRow);
        } else {
            tbody.appendChild(newRow);
        }
    
        // Agregar eventos a los campos
        const importeInput = newRow.querySelector('.item-importe');
        const porcentajeInput = newRow.querySelector('.item-porcentaje');
    
        porcentajeInput.addEventListener('input', () => {
            const porcentaje = parseFloat(porcentajeInput.value) || 0;
            const nuevoImporte = (importeSinIGV * porcentaje / 100);
            importeInput.value = nuevoImporte.toFixed(2);
            this.updateTotalsAndReferences();
        });
    
        importeInput.addEventListener('input', () => {
            const importe = parseFloat(importeInput.value) || 0;
            const nuevoPorcentaje = (importe / importeSinIGV * 100);
            porcentajeInput.value = nuevoPorcentaje.toFixed(2);
            this.updateTotalsAndReferences();
        });
        
        // NUEVO: Añadir evento de cambio para el selector de proyecto
        const proyectoSelect = newRow.querySelector('.item-proyecto');
        if (proyectoSelect) {
            proyectoSelect.addEventListener('change', () => {
                console.log(`Proyecto cambiado a: ${proyectoSelect.value}`);
                // Actualizar otros cargos cuando cambia el proyecto
                this.handleOtrosCargosChange();
            });
        }
    
        this.updateTotalsAndReferences();
    }

    updateTotalsAndReferences() {
        const tbody = document.getElementById('itemsTableBody');
        const importeTotal = parseFloat(document.getElementById('importe').value) || 0;
        const importeSinIGV = importeTotal / 1.18;
    
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
            <td><strong>Importe SIN IGV (-18%):</strong></td>
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
            'importe', 'solicitante',
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

    initializeNewFields() {
        const cantidadItemsInput = document.getElementById('cantidadItems');
        const otrosCargosInput = document.getElementById('otrosCargos');
        const accordionToggle = document.querySelector('.accordion-toggle');

        // Manejar el acordeón
        accordionToggle.addEventListener('click', () => {
            const content = document.querySelector('.accordion-content');
            content.classList.toggle('active');
            accordionToggle.textContent = content.classList.contains('active') ? 
                'Opciones adicionales ▼' : 'Opciones adicionales ▶';
        });

        cantidadItemsInput.addEventListener('input', () => this.handleCantidadItemsChange());
        otrosCargosInput.addEventListener('input', () => this.handleOtrosCargosChange());
    }

    handleCantidadItemsChange() {
        const cantidadItems = parseInt(document.getElementById('cantidadItems').value);
        if (!cantidadItems || isNaN(cantidadItems)) return;

        this.clearItems(); // Limpiar items existentes
        const importeTotal = parseFloat(document.getElementById('importe').value) || 0;
        const importeSinIGV = importeTotal / 1.18;
        const porcentajePorItem = 100 / cantidadItems;
        const importePorItem = (importeSinIGV * porcentajePorItem / 100).toFixed(2);

        for (let i = 0; i < cantidadItems; i++) {
            this.addNewItem({
                importe: importePorItem,
                porcentaje: porcentajePorItem.toFixed(2)
            });
        }

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