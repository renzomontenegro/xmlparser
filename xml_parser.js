class InvoiceParser {
    constructor() {
        this.namespaces = {
            'cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
            'cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
            'sac': 'urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1'
        };
        this.initializeEventListeners();
        this.initializeComprobanteFormat();
    }

    initializeEventListeners() {
        document.getElementById('xmlFile').addEventListener('change', (e) => this.handleFileUpload(e));
        document.getElementById('invoiceForm').addEventListener('submit', (e) => this.handleFormSubmit(e));
        document.getElementById('addItemBtn').addEventListener('click', () => this.addNewItem());
        document.getElementById('fechaEmision').addEventListener('change', () => this.updateCreditDays());
        document.getElementById('fechaVencimiento').addEventListener('change', () => this.updateCreditDays());
        document.getElementById('clearFormBtn').addEventListener('click', () => this.clearForm());
    }

    initializeComprobanteFormat() {
        const parte1 = document.getElementById('numeroComprobanteParte1');
        const parte2 = document.getElementById('numeroComprobanteParte2');
        const numeroComprobanteCompleto = document.getElementById('numeroComprobante');
    
        // Crear tooltips para los mensajes de validación
        const tooltip1 = document.createElement('div');
        tooltip1.className = 'validation-tooltip';
        const tooltip2 = document.createElement('div');
        tooltip2.className = 'validation-tooltip';
    
        parte1.parentElement.appendChild(tooltip1);
        parte2.parentElement.appendChild(tooltip2);
    
        const handleParte1 = (input) => {
            // Limitar a 4 caracteres
            input.value = input.value.slice(0, 4);
            
            // Validar y mostrar mensaje
            if (input.value.length < 4) {
                tooltip1.textContent = `Faltan ${4 - input.value.length} dígitos`;
                tooltip1.style.display = 'block';
            } else {
                tooltip1.style.display = 'none';
            }
    
            actualizarComprobanteCompleto();
        };
    
        const handleParte2 = (input) => {
            // Solo permitir números y limitar a 8 dígitos
            input.value = input.value.replace(/\D/g, '').slice(0, 8);
            
            // Validar y mostrar mensaje
            if (input.value.length < 8) {
                tooltip2.textContent = `Faltan ${8 - input.value.length} dígitos`;
                tooltip2.style.display = 'block';
            } else {
                tooltip2.style.display = 'none';
            }
    
            actualizarComprobanteCompleto();
        };
    
        const actualizarComprobanteCompleto = () => {
            numeroComprobanteCompleto.value = `${parte1.value}-${parte2.value}`;
        };
    
        // Eventos para parte1
        parte1.addEventListener('input', () => handleParte1(parte1));
        parte1.addEventListener('blur', () => {
            if (parte1.value.length < 4) {
                tooltip1.style.display = 'block';
            }
        });
    
        // Eventos para parte2
        parte2.addEventListener('input', () => handleParte2(parte2));
        parte2.addEventListener('blur', () => {
            if (parte2.value.length < 8) {
                tooltip2.style.display = 'block';
            }
        });
    
        // Prevenir entrada de caracteres no numéricos SOLO para parte2
        parte2.addEventListener('keypress', (e) => {
            if (!/^\d$/.test(e.key)) {
                e.preventDefault();
            }
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
            
            // Restablecer los campos calculados
            document.getElementById('condicionPago').value = '';
            
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
        console.log('Form data:', formData);
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
            // Usar el nuevo método para obtener el ID
            const invoiceId = this.getInvoiceId(xmlDoc);
            
            // Separar el ID en las dos partes requeridas
            let parte1 = '', parte2 = '';
            if (invoiceId) {
                const parts = invoiceId.split('-');
                if (parts.length === 2) {
                    parte1 = parts[0]; // Ejemplo: E001 o F002
                    parte2 = parts[1]; // Parte numérica
                }
            }

            // Obtener el importe total correcto con IGV
            let importe = this.getElementValue(xmlDoc, "TaxInclusiveAmount");
            if (!importe) {
                importe = this.getElementValue(xmlDoc, "PayableAmount");
            }
    
            return {
                ruc: this.getElementValue(xmlDoc, "ID", xmlDoc.querySelector("*|AccountingSupplierParty")),
                razonSocial: this.getElementValue(xmlDoc, "RegistrationName"),
                moneda: this.standardizeCurrency(this.getElementValue(xmlDoc, "DocumentCurrencyCode")),
                fechaEmision: this.getElementValue(xmlDoc, "IssueDate"),
                numeroComprobanteParte1: parte1,
                numeroComprobanteParte2: parte2,
                numeroComprobante: invoiceId,
                importe: importe,
                solicitante: '',
                descripcion: '',
                fechaInicioLicencia: '',
                fechaFinLicencia: '',
                areaSolicitante: '',
                items: []
            };

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
            'condicionPago',
            'porcentajeDetraccion',
            'codigoBien',
            'cuentaContable',
            'tipoFactura',
            'fechaVencimiento'
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
            document.getElementById('numeroComprobanteParte2').value = data.numeroComprobanteParte2;
        }
        if (data.numeroComprobante) {
            document.getElementById('numeroComprobante').value = data.numeroComprobante;
        }

        // Limpiar items existentes y agregar nueva fila
        this.clearItems();
        this.addNewItem();

        // Actualizar días de crédito
        this.updateCreditDays();

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
        
        // Obtener índice correcto contando solo las filas de items (no las de totales)
        const itemRows = tbody.querySelectorAll('tr:not(#totalRow):not(#importeSinIGVRow):not(#importeConIGVRow)');
        const rowIndex = itemRows.length + 1;
    
        const newRow = document.createElement('tr');
        newRow.innerHTML = `
            <td>${rowIndex}</td>
            <td><input type="number" step="0.01" class="item-importe" value="" placeholder="Monto sin IGV"></td>
            <td><input type="number" step="0.01" class="item-porcentaje" value="" placeholder="%"></td>
            <td><input type="text" class="item-lineaNegocio" value=""></td>
            <td><input type="text" class="item-centroCosto" value=""></td>
            <td><input type="text" class="item-proyecto" value=""></td>
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
    
        porcentajeInput.addEventListener('change', () => {
            const porcentaje = parseFloat(porcentajeInput.value) || 0;
            const nuevoImporte = (importeSinIGV * porcentaje / 100);
            importeInput.value = nuevoImporte.toFixed(2);
            this.updateTotalsAndReferences();
        });
    
        importeInput.addEventListener('change', () => {
            const importe = parseFloat(importeInput.value) || 0;
            const nuevoPorcentaje = (importe / importeSinIGV * 100);
            porcentajeInput.value = nuevoPorcentaje.toFixed(2);
            this.updateTotalsAndReferences();
        });
    
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

    updateCreditDays() {
        const condicionPagoInput = document.getElementById('condicionPago');
        const fechaEmisionInput = document.getElementById('fechaEmision');
        
        // Agregar evento al input de condición de pago
        condicionPagoInput.addEventListener('change', () => {
            this.calculateDueDate();
        });
    
        // Agregar evento a la fecha de emisión
        fechaEmisionInput.addEventListener('change', () => {
            this.calculateDueDate();
        });
    }

    calculateDueDate() {
        const fechaEmision = document.getElementById('fechaEmision').value;
        const diasCredito = parseInt(document.getElementById('condicionPago').value) || 0;
        
        if (fechaEmision && !isNaN(diasCredito)) {
            const fechaBase = new Date(fechaEmision);
            const fechaVencimiento = new Date(fechaBase.setDate(fechaBase.getDate() + diasCredito));
            
            // Formatear la fecha para el input date (YYYY-MM-DD)
            const fechaFormateada = fechaVencimiento.toISOString().split('T')[0];
            document.getElementById('fechaVencimiento').value = fechaFormateada;
        } else {
            document.getElementById('fechaVencimiento').value = '';
        }
    }

    collectFormData() {
        const formData = {
            basic: {},
            items: []
        };
    
        // Lista de campos básicos a recolectar
        const basicFields = [
            'ruc', 'razonSocial', 'moneda', 'fechaEmision', 'numeroComprobante',
            'importe', 'condicionPago', 'fechaVencimiento', 'solicitante',
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
    
                    if (importeInput) { // Si existe el input de importe, es una fila de item válida
                        const item = {
                            numeroItem: formData.items.length + 1,
                            importe: importeInput.value || '0',
                            porcentaje: porcentajeInput?.value || '0',
                            lineaNegocio: lineaNegocioInput?.value || '',
                            centroCosto: centroCostoInput?.value || '',
                            proyecto: proyectoInput?.value || ''
                        };
                        formData.items.push(item);
                    }
                }
            }
        }
    
        return formData;
    }
}

// Crear instancia global para acceso desde HTML
window.invoiceParser = new InvoiceParser();