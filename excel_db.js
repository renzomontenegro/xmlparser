// excel_db.js - versión actualizada
class ExcelDatabase {
    constructor() {
        this.data = {};
        this.searchTimeout = null;
        this.initializeData();
    }

    async initializeData() {
        try {
            const response = await fetch('plantillas/Plantilla_ERP.xlsx');
            const arrayBuffer = await response.arrayBuffer();
            const workbook = await XlsxPopulate.fromDataAsync(arrayBuffer);

            this.data.porDetraccion = this.loadSheetData(workbook.sheet('PorDetracción'), 'Impuesto', 'Nombre de Impuesto');
            this.data.codDetraccion = this.loadSheetData(workbook.sheet('CodDetracción'), 'Código', 'Detalle');
            this.data.cuentasContables = this.loadSheetData(workbook.sheet('CContables'), 'Cuenta', 'Descripción');
            this.data.tipoFactura = this.loadSheetData(workbook.sheet('TipoFac'), 'Tipo', 'Detalle');
            const ccosSheet = workbook.sheet('CCOs');
            this.ccosData = this.loadCCOsData(ccosSheet);
            const proveedoresSheet = workbook.sheet('Proveedores');
            this.data.proveedores = this.loadProveedoresData(proveedoresSheet);

            this.initializeSelectors();
        } catch (error) {
            console.error('Error loading Excel data:', error);
        }
    }

    loadProveedoresData(sheet) {
        const proveedores = [];
        
        try {
            if (!sheet) return [];
            
            let row = 2; // Empezar después del encabezado
            let emptyRowCount = 0;
            const maxEmptyRows = 5; // Para evitar bucles infinitos si hay problemas con los datos
            
            while (emptyRowCount < maxEmptyRows) {
                // Intentar obtener el RUC (ID del contribuyente) - columna C
                let rucValue = sheet.cell(`C${row}`).value();
                
                // Si no encontramos RUC, contamos como fila vacía y continuamos
                if (!rucValue) {
                    emptyRowCount++;
                    row++;
                    continue;
                }
                
                // Si encontramos datos, reiniciamos el contador
                emptyRowCount = 0;
                
                // Convertir a string para asegurar formato correcto
                const ruc = rucValue.toString();
                const nombreProveedor = sheet.cell(`B${row}`).value() || '';
                const numeroProveedor = sheet.cell(`D${row}`).value() || '';
                
                // Guardar solo el RUC como valor, pero mostrar la información completa en la etiqueta
                proveedores.push({
                    value: ruc, // Solo guardamos el RUC (importante para exportaciones)
                    label: `${ruc} - ${nombreProveedor} - ${numeroProveedor}`
                });
                
                row++;
            }
            
            return proveedores;
        } catch (error) {
            console.error('Error cargando proveedores:', error);
            return [];
        }
    }

    loadCCOsData(sheet) {
        const data = {
            lineasNegocio: new Set(),
            centrosCosto: new Map(),
            proyectos: new Map(),
            descripcionesCC: new Map(),
            ccosAntiguos: new Map(),
            descripcionesProyecto: new Map() // Mapa para guardar descripciones de proyectos
        };

        let row = 2;
        while (sheet.cell(`B${row}`).value()) {
            const descripcion = sheet.cell(`B${row}`).value()?.toString() || '';
            const lineaNegocio = sheet.cell(`C${row}`).value()?.toString() || '';
            const centroCosto = sheet.cell(`D${row}`).value()?.toString() || '';
            const proyecto = sheet.cell(`E${row}`).value()?.toString() || '';
            const ccoAntiguo = sheet.cell(`F${row}`).value()?.toString() || '';
            
            const proyectoDesc = descripcion;

            if (lineaNegocio) {
                data.lineasNegocio.add(lineaNegocio);

                if (!data.centrosCosto.has(lineaNegocio)) {
                    data.centrosCosto.set(lineaNegocio, new Set());
                }
                if (centroCosto) {
                    data.centrosCosto.get(lineaNegocio).add(centroCosto);
                    data.descripcionesCC.set(centroCosto, descripcion);
                    data.ccosAntiguos.set(centroCosto, ccoAntiguo);

                    if (proyecto) {
                        if (!data.proyectos.has(centroCosto)) {
                            data.proyectos.set(centroCosto, new Set());
                        }
                        data.proyectos.get(centroCosto).add(proyecto);
                        
                        // Guardar la descripción del proyecto
                        if (proyectoDesc) {
                            data.descripcionesProyecto.set(proyecto, proyectoDesc);
                        }
                    }
                }
            }
            row++;
        }

        // Buscar en la hoja de Proyectos para complementar las descripciones
        try {
            const proyectosSheet = sheet.workbook().sheet('Proyectos');
            if (proyectosSheet) {
                console.log("Encontrada hoja de Proyectos, cargando descripciones adicionales");
                let proyRow = 2;
                while (proyectosSheet.cell(`A${proyRow}`).value()) {
                    const codProyecto = proyectosSheet.cell(`A${proyRow}`).value()?.toString() || '';
                    const descProyecto = proyectosSheet.cell(`B${proyRow}`).value()?.toString() || '';
                    
                    if (codProyecto && descProyecto) {
                        data.descripcionesProyecto.set(codProyecto, descProyecto);
                        console.log(`Cargada descripción desde hoja Proyectos: ${codProyecto} - ${descProyecto}`);
                    }
                    proyRow++;
                }
            }
        } catch (error) {
            console.log("No se encontró hoja de Proyectos o error al cargar: ", error);
        }

        return data;
    }

    createSelectsForRow(row) {
        // Crear selects para línea de negocio
        const tdLineaNegocio = row.cells[3];
        const selectLN = document.createElement('select');
        selectLN.className = 'item-lineaNegocio';
        selectLN.innerHTML = '<option value="">Seleccione línea de negocio...</option>';
        this.ccosData.lineasNegocio.forEach(ln => {
            selectLN.add(new Option(ln, ln));
        });

        // Crear búsqueda para centro de costo
        const tdCentroCosto = row.cells[4];
        const containerCC = document.createElement('div');
        containerCC.className = 'search-container';
        const searchCC = document.createElement('input');
        searchCC.type = 'text';
        searchCC.className = 'item-centroCosto-search';
        searchCC.placeholder = 'Buscar centro de costo...';
        searchCC.disabled = true;
        const hiddenCC = document.createElement('input');
        hiddenCC.type = 'hidden';
        hiddenCC.className = 'item-centroCosto';
        const optionsCC = document.createElement('div');
        optionsCC.className = 'select-options';

        // Crear select para proyecto
        const tdProyecto = row.cells[5];
        const selectProyecto = document.createElement('select');
        selectProyecto.className = 'item-proyecto';
        selectProyecto.disabled = true;
        selectProyecto.required = true; // Hacerlo obligatorio
        selectProyecto.innerHTML = '<option value="00000000000">00000000000</option>';

        // Eventos
        selectLN.addEventListener('change', () => {
            const lineaNegocio = selectLN.value;
            searchCC.disabled = !lineaNegocio;
            searchCC.value = '';
            hiddenCC.value = '';
            selectProyecto.innerHTML = '<option value="">Seleccione proyecto...</option>';
            selectProyecto.disabled = true;

            if (lineaNegocio) {
                searchCC.disabled = false;
            }
        });

        // Mostrar opciones al hacer focus o click
        searchCC.addEventListener('focus', () => {
            if (!searchCC.disabled) {
                showCentroCostoOptions();
            }
        });

        searchCC.addEventListener('click', () => {
            if (!searchCC.disabled) {
                showCentroCostoOptions();
            }
        });

        // Cerrar al hacer click fuera
        document.addEventListener('click', (e) => {
            if (!searchCC.contains(e.target) && !optionsCC.contains(e.target)) {
                optionsCC.style.display = 'none';
            }
        });

        // Función para mostrar las opciones de Centro de Costo
        const showCentroCostoOptions = () => {
            const lineaNegocio = selectLN.value;
            const searchTerm = searchCC.value.toLowerCase();
            optionsCC.innerHTML = '';
        
            if (lineaNegocio && this.ccosData.centrosCosto.has(lineaNegocio)) {
                const centrosCosto = Array.from(this.ccosData.centrosCosto.get(lineaNegocio));
                const filteredCC = searchTerm ? 
                    centrosCosto.filter(cc => {
                        const descripcion = this.ccosData.descripcionesCC.get(cc) || '';
                        const ccoAntiguo = this.ccosData.ccosAntiguos.get(cc) || '';
                        return cc.toLowerCase().includes(searchTerm) || 
                               descripcion.toLowerCase().includes(searchTerm) ||
                               ccoAntiguo.toLowerCase().includes(searchTerm);
                    }) : centrosCosto;
        
                filteredCC.forEach(cc => {
                    const option = document.createElement('div');
                    option.className = 'select-option';
                    
                    // CAMBIO: Mostrar solo el código del Centro de Costo
                    option.textContent = cc;
                    option.dataset.value = cc;
                    
                    option.addEventListener('click', () => {
                        // CAMBIO: Solo mostrar el código en el campo de búsqueda
                        searchCC.value = cc;
                        hiddenCC.value = cc;
                        optionsCC.style.display = 'none';
                        this.updateProyectos(selectProyecto, cc);
                    });
                    
                    optionsCC.appendChild(option);
                });
                
                optionsCC.style.display = 'block';
            }
        };

        // Implementar búsqueda de centro de costo
        searchCC.addEventListener('input', () => {
            const searchTerm = searchCC.value.toLowerCase();
            const lineaNegocio = selectLN.value;
            optionsCC.innerHTML = '';

            if (lineaNegocio && this.ccosData.centrosCosto.has(lineaNegocio)) {
                const centrosCosto = Array.from(this.ccosData.centrosCosto.get(lineaNegocio));
                const filteredCC = centrosCosto.filter(cc => {
                    // Asegurarnos de que todos los valores existan y sean strings
                    const ccLower = (cc || '').toString().toLowerCase();
                    const descripcion = (this.ccosData.descripcionesCC.get(cc) || '').toString().toLowerCase();
                    const ccoAntiguo = (this.ccosData.ccosAntiguos.get(cc) || '').toString().toLowerCase();

                    return ccLower.includes(searchTerm) || 
                        descripcion.includes(searchTerm) ||
                        ccoAntiguo.includes(searchTerm);
                });

                filteredCC.forEach(cc => {
                    const option = document.createElement('div');
                    option.className = 'select-option';
                    
                    // CAMBIO: Mostrar solo el código del Centro de Costo
                    option.textContent = cc;
                    option.dataset.value = cc;
                    
                    option.addEventListener('click', () => {
                        // CAMBIO: Solo mostrar el código en el campo de búsqueda
                        searchCC.value = cc;
                        hiddenCC.value = cc;
                        optionsCC.style.display = 'none';
                        this.updateProyectos(selectProyecto, cc);
                    });
                    
                    optionsCC.appendChild(option);
                });
                
                optionsCC.style.display = filteredCC.length ? 'block' : 'none';
            }
        });

        // Reemplazar contenido de las celdas
        tdLineaNegocio.innerHTML = '';
        tdLineaNegocio.appendChild(selectLN);

        tdCentroCosto.innerHTML = '';
        containerCC.appendChild(searchCC);
        containerCC.appendChild(hiddenCC);
        containerCC.appendChild(optionsCC);
        tdCentroCosto.appendChild(containerCC);

        tdProyecto.innerHTML = '';
        tdProyecto.appendChild(selectProyecto);
    }

    // Reemplazar en excel_db.js
updateProyectos(selectProyecto, centroCosto) {
    // Inicializar con la opción de 11 ceros y hacerlo required
    selectProyecto.innerHTML = '<option value="00000000000">00000000000 - Sin Proyecto</option>';
    selectProyecto.disabled = !centroCosto;
    selectProyecto.required = true; // Hacer el campo obligatorio

    if (centroCosto && this.ccosData.proyectos.has(centroCosto)) {
        const proyectos = Array.from(this.ccosData.proyectos.get(centroCosto));
        proyectos.forEach(proyecto => {
            // Obtener descripción del proyecto
            const descripcion = this.ccosData.descripcionesProyecto.get(proyecto) || '';
            const optionText = descripcion ? `${proyecto} - ${descripcion}` : proyecto;
            
            selectProyecto.add(new Option(optionText, proyecto));
        });
    }
}

    loadSheetData(sheet, col1, col2) {
        try {
            const data = [];
            let row = 2; // Empezar después del encabezado
            
            while (sheet.cell(`A${row}`).value()) {
                const value = sheet.cell(`A${row}`).value();
                const description = sheet.cell(`B${row}`).value();
                
                if (value) {
                    data.push({
                        value: value.toString(),
                        label: `${value} - ${description || ''}`
                    });
                }
                row++;
            }
            
            return data;
        } catch (error) {
            console.error('Error loading sheet data:', error);
            return [];
        }
    }

    initializeSelectors() {
        this.populateSelect('porcentajeDetraccion', this.data.porDetraccion);
        this.populateSelect('codigoBien', this.data.codDetraccion);
        this.initializeSearchableSelect('cuentaContable', this.data.cuentasContables);
        this.initializeSearchableSelect('ruc', this.data.proveedores); // Añadir esta línea
        this.populateSelect('tipoFactura', this.data.tipoFactura);
        this.validateSearchableFields();
    }

    initializeRucSearch() {
        const searchInput = document.getElementById('rucSearch');
        const hiddenInput = document.getElementById('ruc');
        const optionsContainer = document.getElementById('rucOptions');
        
        if (!searchInput || !optionsContainer || !hiddenInput) return;
    
        let searchTimeout = null;
    
        const showFilteredOptions = (searchTerm = '') => {
            if (!this.data.proveedores || !Array.isArray(this.data.proveedores)) {
                console.error('No hay datos de proveedores disponibles');
                return;
            }
    
            // Filtrar los datos
            const filteredData = searchTerm.length > 0 
                ? this.data.proveedores.filter(item => {
                    const searchLower = searchTerm.toLowerCase();
                    return (
                        (item.ruc && item.ruc.toLowerCase().includes(searchLower)) ||
                        (item.nombre && item.nombre.toLowerCase().includes(searchLower)) ||
                        (item.numero && item.numero.toLowerCase().includes(searchLower))
                    );
                })
                : this.data.proveedores;
    
            // Limpiar y llenar el contenedor de opciones
            optionsContainer.innerHTML = '';
            
            if (filteredData.length === 0) {
                const noResults = document.createElement('div');
                noResults.className = 'select-option';
                noResults.textContent = 'No se encontraron resultados';
                optionsContainer.appendChild(noResults);
            } else {
                filteredData.forEach(item => {
                    const option = document.createElement('div');
                    option.className = 'select-option';
                    option.dataset.value = item.ruc;
                    option.innerHTML = item.label;
                    
                    option.addEventListener('click', () => {
                        searchInput.value = `${item.ruc} - ${item.nombre}`;
                        hiddenInput.value = item.ruc;
                        optionsContainer.classList.remove('active');
                    });
                    
                    optionsContainer.appendChild(option);
                });
            }
    
            optionsContainer.classList.add('active');
        };
    
        // Evento de input para la búsqueda
        searchInput.addEventListener('input', (e) => {
            if (searchTimeout) {
                clearTimeout(searchTimeout);
            }
            
            searchTimeout = setTimeout(() => {
                const searchTerm = e.target.value;
                showFilteredOptions(searchTerm);
            }, 300);
        });
    
        // Mostrar todas las opciones al hacer focus
        searchInput.addEventListener('focus', () => {
            showFilteredOptions(searchInput.value);
        });
    
        // Cerrar las opciones al hacer click fuera
        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !optionsContainer.contains(e.target)) {
                optionsContainer.classList.remove('active');
            }
        });
    }

    populateSelect(elementId, data) {
        const select = document.getElementById(elementId);
        if (!select) return;

        select.innerHTML = '<option value="">Seleccione...</option>';
        
        data.forEach(item => {
            const option = document.createElement('option');
            option.value = item.value;
            option.textContent = item.label;
            select.appendChild(option);
        });
    }

    initializeSearchableSelect(elementId, data) {
        const searchInput = document.getElementById(`${elementId}Search`);
        const hiddenInput = document.getElementById(elementId);
        const optionsContainer = document.getElementById(`${elementId}Options`);
        
        if (!searchInput || !optionsContainer || !hiddenInput) return;
    
        let searchTimeout = null;
        let isValid = false; // Añadir esta variable para controlar validez
    
        const showFilteredOptions = (searchTerm = '') => {
            // Asegurarnos de que tenemos acceso a los datos
            if (!data || !Array.isArray(data)) {
                console.error(`No hay datos disponibles para ${elementId}`);
                return;
            }
    
            // Filtrar los datos
            const filteredData = searchTerm.length > 0 
                ? data.filter(item => {
                    const searchLower = searchTerm.toLowerCase();
                    return (
                        (item.label && item.label.toLowerCase().includes(searchLower)) ||
                        (item.value && item.value.toLowerCase().includes(searchLower))
                    );
                })
                : data;
    
            // Limpiar y llenar el contenedor de opciones
            optionsContainer.innerHTML = '';
            
            if (filteredData.length === 0) {
                const noResults = document.createElement('div');
                noResults.className = 'select-option';
                noResults.textContent = 'No se encontraron resultados';
                optionsContainer.appendChild(noResults);
            } else {
                filteredData.forEach(item => {
                    const option = document.createElement('div');
                    option.className = 'select-option';
                    option.dataset.value = item.value;
                    option.textContent = item.label;
                    
                    option.addEventListener('click', () => {
                        // Aquí está el cambio: para el ruc, mostrar solo el valor
                        if (elementId === 'ruc') {
                            searchInput.value = item.value; // Solo mostrar el RUC
                        } else {
                            searchInput.value = item.label; // Para otros campos, mostrar la etiqueta completa
                        }
                        
                        hiddenInput.value = item.value; // Siempre guardamos solo el código en el input hidden
                        isValid = true;
                        optionsContainer.classList.remove('active');
                    });
                    
                    optionsContainer.appendChild(option);
                });
            }
    
            optionsContainer.classList.add('active');
        };
    
        // Mejorar el evento de input para la búsqueda
        searchInput.addEventListener('input', (e) => {
            if (searchTimeout) {
                clearTimeout(searchTimeout);
            }
            
            searchTimeout = setTimeout(() => {
                const searchTerm = e.target.value;
                showFilteredOptions(searchTerm);
            }, 300);
        });
    
        // Mostrar todas las opciones al hacer focus
        searchInput.addEventListener('focus', () => {
            showFilteredOptions(searchInput.value);
        });
    
        // Cerrar las opciones al hacer click fuera
        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !optionsContainer.contains(e.target)) {
                optionsContainer.classList.remove('active');
            }
        });
    
        // Validar que se haya seleccionado un elemento de la lista
        searchInput.addEventListener('change', () => {
            const currentValue = searchInput.value;
            const options = data || [];
            
            // Verificar si el valor actual corresponde a alguna opción
            isValid = options.some(item => item.label === currentValue);
            
            if (!isValid) {
                // Si no es válido, limpiar el valor del input hidden
                hiddenInput.value = '';
            }
        });
    
        // Mejorar la navegación con teclado
        searchInput.addEventListener('keydown', (e) => {
            const options = Array.from(optionsContainer.querySelectorAll('.select-option'));
            const selectedOption = optionsContainer.querySelector('.select-option.selected');
            let selectedIndex = options.indexOf(selectedOption);
    
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    if (selectedIndex < options.length - 1) {
                        if (selectedOption) selectedOption.classList.remove('selected');
                        options[selectedIndex + 1].classList.add('selected');
                        options[selectedIndex + 1].scrollIntoView({ block: 'nearest' });
                    } else if (selectedIndex === -1 && options.length > 0) {
                        options[0].classList.add('selected');
                        options[0].scrollIntoView({ block: 'nearest' });
                    }
                    break;
    
                case 'ArrowUp':
                    e.preventDefault();
                    if (selectedIndex > 0) {
                        if (selectedOption) selectedOption.classList.remove('selected');
                        options[selectedIndex - 1].classList.add('selected');
                        options[selectedIndex - 1].scrollIntoView({ block: 'nearest' });
                    }
                    break;
    
                case 'Enter':
                    e.preventDefault();
                    if (selectedOption) {
                        const value = selectedOption.dataset.value;
                        const label = selectedOption.textContent;
                        searchInput.value = label;
                        hiddenInput.value = value;
                        isValid = true;
                        optionsContainer.classList.remove('active');
                    }
                    break;
    
                case 'Escape':
                    e.preventDefault();
                    optionsContainer.classList.remove('active');
                    searchInput.blur();
                    break;
            }
        });
    
        // Agregar funcionalidad para limpiar la selección
        const clearSelection = () => {
            searchInput.value = '';
            hiddenInput.value = '';
            isValid = false;
            optionsContainer.classList.remove('active');
        };
    
        // Permitir borrar la selección
        searchInput.addEventListener('keyup', (e) => {
            if (e.key === 'Backspace' && searchInput.value === '') {
                clearSelection();
            }
        });
    }

    validateSearchableFields() {
        // Botones que requieren validación
        const buttons = ['exportSolicitudBtn', 'exportERPBtn', 'downloadAllBtn', 'saveFormBtn'];
        
        buttons.forEach(btnId => {
            const btn = document.getElementById(btnId);
            if (btn) {
                // Eliminar todos los event listeners anteriores
                const newBtn = btn.cloneNode(true);
                btn.parentNode.replaceChild(newBtn, btn);
                
                // Agregar nuestro event listener
                newBtn.addEventListener('click', function(e) {
                    // Primero detener el evento para prevenir cualquier acción
                    e.preventDefault();
                    e.stopPropagation();
                    
                    // Validar que el formulario básico sea válido
                    const form = document.getElementById('invoiceForm');
                    if (!form.checkValidity()) {
                        form.reportValidity();
                        return false;
                    }
                    
                    // Validar campo RUC con verificación explícita
                    const rucValue = document.getElementById('ruc').value;
                    const rucSearch = document.getElementById('rucSearch').value;
                    
                    if (!rucValue || rucValue.trim() === '') {
                        alert('Debe seleccionar un proveedor válido de la lista');
                        document.getElementById('rucSearch').focus();
                        return false;
                    }
                    
                    // Validar cuenta contable con verificación explícita
                    const cuentaValue = document.getElementById('cuentaContable').value;
                    const cuentaSearch = document.getElementById('cuentaContableSearch').value;
                    
                    if (!cuentaValue || cuentaValue.trim() === '') {
                        alert('Debe seleccionar una cuenta contable válida de la lista');
                        document.getElementById('cuentaContableSearch').focus();
                        return false;
                    }
                    
                    // Si llegamos aquí, todo está validado correctamente
                    console.log('Todas las validaciones pasaron, ejecutando acción...');
                    
                    // Ejecutar la acción correspondiente
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
                        case 'saveFormBtn':
                            window.formStorage.saveForm();
                            break;
                    }
                    
                    return true;
                });
            }
        });
    }

    addOptionsToSelect(select, data) {
        // Mantener las dos primeras opciones (Seleccione... y buscador)
        const firstOptions = select.querySelectorAll('option:nth-child(-n+2)');
        select.innerHTML = '';
        firstOptions.forEach(opt => select.appendChild(opt));

        // Agregar las opciones filtradas
        data.forEach(item => {
            const option = document.createElement('option');
            option.value = item.value;
            option.textContent = item.label;
            select.appendChild(option);
        });
    }
}

window.excelDb = new ExcelDatabase();