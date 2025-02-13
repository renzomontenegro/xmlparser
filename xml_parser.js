class InvoiceParser {
    constructor() {
        this.namespaces = {
            'cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
            'cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
            'sac': 'urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1'
        };
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        document.getElementById('xmlFile').addEventListener('change', (e) => this.handleFileUpload(e));
        document.getElementById('invoiceForm').addEventListener('submit', (e) => this.handleFormSubmit(e));
        document.getElementById('addItemBtn').addEventListener('click', () => this.addNewItem());
        document.getElementById('fechaEmision').addEventListener('change', () => this.updateCreditDays());
        document.getElementById('fechaVencimiento').addEventListener('change', () => this.updateCreditDays());
        document.getElementById('clearFormBtn').addEventListener('click', () => this.clearForm());
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

    parseInvoiceXML(xmlDoc) {
        try {
            // Usar el nuevo método para obtener el ID
            const invoiceId = this.getInvoiceId(xmlDoc);
            
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
                numeroComprobante: invoiceId,
                importe: importe,
                fechaVencimiento: this.getElementValue(xmlDoc, "DueDate"),
                solicitante: '',
                descripcion: Array.from(this.getElements(xmlDoc, "Note"))
                    .find(note => !note.getAttribute('languageLocaleID'))?.textContent || '',
                codigoBien: '',
                porcentajeDetraccion: this.getDetractionPercentage(xmlDoc),
                fechaInicioLicencia: '',
                fechaFinLicencia: '',
                areaSolicitante: '',
                items: this.parseInvoiceItems(xmlDoc, importe)
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
        // Poblar campos básicos
        for (const [key, value] of Object.entries(data)) {
            if (key !== 'items') {
                const element = document.getElementById(key);
                if (element) element.value = value;
            }
        }

        // Poblar items
        this.clearItems();
        data.items.forEach(item => this.addNewItem(item));

        // Actualizar días de crédito
        this.updateCreditDays();
    }

    clearItems() {
        const tbody = document.getElementById('itemsTableBody');
        tbody.innerHTML = '';
    }

    addNewItem(itemData = null) {
        const tbody = document.getElementById('itemsTableBody');
        
        // Remover temporalmente la fila de total si existe
        const totalRow = document.getElementById('totalRow');
        if (totalRow) {
            totalRow.remove();
        }
        
        const newRow = document.createElement('tr');
        const rowIndex = totalRow ? tbody.children.length + 1 : tbody.children.length + 1;
    
        // Asegurarse de que los valores sean strings válidos
        const importe = itemData?.importe ? Number(itemData.importe).toFixed(2) : '';
        const porcentaje = itemData?.porcentaje ? Number(itemData.porcentaje).toFixed(2) : '';
    
        newRow.innerHTML = `
            <td>${rowIndex}</td>
            <td><input type="number" step="0.01" class="item-importe" value="${importe}" onchange="window.invoiceParser.updateItemPercentages()"></td>
            <td><input type="number" step="0.01" class="item-porcentaje" value="${porcentaje}" readonly></td>
            <td><input type="text" class="item-lineaNegocio" value="${itemData?.lineaNegocio || ''}"></td>
            <td><input type="text" class="item-centroCosto" value="${itemData?.centroCosto || ''}"></td>
            <td><input type="text" class="item-proyecto" value="${itemData?.proyecto || ''}"></td>
            <td><button type="button" class="remove-btn" onclick="window.invoiceParser.removeItem(this)">Eliminar</button></td>
        `;
    
        tbody.appendChild(newRow);
        
        // Actualizar los porcentajes y totales
        this.updateItemPercentages();
    }

    removeItem(button) {
        const row = button.closest('tr');
        row.remove();
        this.renumberItems();
        this.updateItemPercentages();
    }

    renumberItems() {
        const rows = document.getElementById('itemsTableBody').getElementsByTagName('tr');
        for (let i = 0; i < rows.length; i++) {
            rows[i].cells[0].textContent = i + 1;
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
        const fechaEmision = document.getElementById('fechaEmision').value;
        const fechaVencimiento = document.getElementById('fechaVencimiento').value;
        
        // Solo calcular si ambas fechas están disponibles
        if (fechaEmision && fechaVencimiento) {
            const emision = new Date(fechaEmision);
            const vencimiento = new Date(fechaVencimiento);
            const diffTime = Math.abs(vencimiento - emision);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            document.getElementById('condicionPago').value = diffDays;
        } else {
            // Si falta alguna fecha, dejar el campo vacío
            document.getElementById('condicionPago').value = '';
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
                formData.basic[field] = ''; // Valor por defecto si el elemento no existe
                console.warn(`Campo ${field} no encontrado en el formulario`);
            }
        });

        // Recolectar items con validación
        const tbody = document.getElementById('itemsTableBody');
        if (tbody) {
            const rows = tbody.getElementsByTagName('tr');
            Array.from(rows).forEach(row => {
                // Verificar que no sea la fila de totales
                if (!row.classList.contains('total-row')) {
                    const item = {
                        numeroItem: row.cells[0]?.textContent || '',
                        importe: row.querySelector('.item-importe')?.value || '0',
                        porcentaje: row.querySelector('.item-porcentaje')?.value || '0',
                        lineaNegocio: row.querySelector('.item-lineaNegocio')?.value || '',
                        centroCosto: row.querySelector('.item-centroCosto')?.value || '',
                        proyecto: row.querySelector('.item-proyecto')?.value || ''
                    };
                    formData.items.push(item);
                }
            });
        }

        return formData;
    }
}

// Crear instancia global para acceso desde HTML
window.invoiceParser = new InvoiceParser();