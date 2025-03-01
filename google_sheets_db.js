/**
 * GoogleSheetsDatabase - Gestiona la carga de datos desde Google Sheets
 * Sigue principios de diseño modular y código limpio
 */
class GoogleSheetsDatabase {
    /**
     * Constructor de la clase
     * Inicializa propiedades y prepara la carga de datos
     */
    constructor() {
        this.API_ENDPOINT = 'https://script.google.com/macros/s/AKfycbws75RUZF_2EMHIUFZ1sGxSXUm8y6mN5GLiRXvegX2H03oGjfuHtQCClK0qVZBFbZDluQ/exec';
        
        this.dataCache = {};
        
        this.sheetsToLoad = [
            'PorDetracción', 
            'CodDetracción', 
            'CContables', 
            'TipoFac', 
            'Proveedores',
            'CCOs',
            'Proyectos'
        ];
    
        // Inicializar la estructura de ccosData que se espera en xml_parser.js
        this.ccosData = {
            lineasNegocio: new Set(),
            centrosCosto: new Map(),
            proyectos: new Map(),
            descripcionesCC: new Map(),
            ccosAntiguos: new Map(),
            descripcionesProyecto: new Map()
        };
        
        this.initializeDatabase();
        
        // Mostrar mensaje de inicialización
        console.log('GoogleSheetsDatabase inicializado');
    }

    /**
     * Inicializa la base de datos cargando todas las hojas
     * @returns {Promise<void>}
     */
    async initializeDatabase() {
        try {
            console.log('Iniciando carga de datos desde Google Sheets');
            
            const loadPromises = this.sheetsToLoad.map(async (sheet) => {
                console.log(`Cargando hoja: ${sheet}`);
                const data = await this.fetchSheetData(sheet);
                return data;
            });
    
            await Promise.all(loadPromises);
            
            console.log('Todas las hojas cargadas correctamente');
            
            // Preparar los datos de centros de costo
            this.prepareCCOsData();
            
            // ¡NUEVO! Preparar datos de proveedores
            this.prepareProveedoresData();
            
            // Inicializar selectores
            this.initializeSelectors();
            
            // Inicializar campos requeridos
            this.initializeRequiredFields();
            
            // Validar campos de búsqueda
            this.validateSearchableFields();
            
            console.log('Inicialización completa de GoogleSheetsDatabase');
        } catch (error) {
            console.error('Error en initializeDatabase:', error);
            alert('Error al cargar datos desde Google Sheets. Algunas funcionalidades pueden no estar disponibles.');
        }
    }

    /**
     * Recupera los datos de una hoja específica
     * @param {string} sheetName - Nombre de la hoja a cargar
     * @returns {Promise<Array>} - Datos de la hoja
     */
    async fetchSheetData(sheetName) {
        try {
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 segundos de timeout
            
            const response = await fetch(`${this.API_ENDPOINT}?sheet=${sheetName}`, {
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                console.error(`HTTP error! status: ${response.status}`);
                console.error('Response:', await response.text());
                throw new Error(`Error al cargar la hoja ${sheetName}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            
            // Verificar si la hoja existe en la respuesta
            if (!data[sheetName]) {
                console.error(`No se encontraron datos para la hoja ${sheetName}`);
                console.error('Datos recibidos:', data);
                return [];
            }
            
            // Guardar en caché
            this.dataCache[sheetName] = data[sheetName];
            
            return this.dataCache[sheetName];
        } catch (error) {
            console.error(`Error recuperando datos de ${sheetName}:`, error);
            
            // Si es un error de red o timeout
            if (error.name === 'AbortError') {
                console.error('La solicitud excedió el tiempo de espera');
            }
            
            // Imprimir detalles completos del error
            console.error('Error completo:', error.toString());
            console.error('Stack:', error.stack);
            
            return [];
        }
    }

    /**
     * Inicializa los selectores del formulario con los datos cargados
     */
    initializeSelectors() {
        this.populateSelect('porcentajeDetraccion', this.dataCache['PorDetracción'] || []);
        this.populateSelect('codigoBien', this.dataCache['CodDetracción'] || []);
        this.initializeSearchableSelect('cuentaContable', this.dataCache['CContables'] || []);
        this.initializeSearchableSelect('ruc', this.dataCache['Proveedores'] || []);
        this.populateSelect('tipoFactura', this.dataCache['TipoFac'] || []);
    }

    /**
     * Prepara los datos de Centros de Costo para selección dinámica
     */
    prepareCCOsData() {
        try {
            console.log('Preparando datos de Centros de Costo');
            
            const ccosData = this.dataCache['CCOs'] || [];
            const proyectosData = this.dataCache['Proyectos'] || [];
            
            // Limpiar datos anteriores
            this.ccosData = {
                lineasNegocio: new Set(),
                centrosCosto: new Map(),
                proyectos: new Map(),
                descripcionesCC: new Map(),
                ccosAntiguos: new Map(),
                descripcionesProyecto: new Map()
            };
            
            // Procesar datos de CCOs
            ccosData.forEach(item => {
                if (!item.value || !item.label) return; // Omitir items inválidos
                
                // Extraer información
                const centroCosto = item.value;
                let descripcion = '';
                
                // Extraer descripción del label (formato típico: "codigo - descripción")
                if (item.label && item.label.includes(' - ')) {
                    const parts = item.label.split(' - ');
                    if (parts.length >= 2) {
                        descripcion = parts[1].trim();
                    }
                }
                
                // Extraer información adicional (campos personalizados desde Google Sheets)
                const lineaNegocio = item.extra1 || '';
                const proyecto = item.extra2 || '';
                const ccoAntiguo = item.extra3 || '';
                
                // Guardar línea de negocio
                if (lineaNegocio) {
                    this.ccosData.lineasNegocio.add(lineaNegocio);
                    
                    // Crear relación línea de negocio -> centro de costo
                    if (!this.ccosData.centrosCosto.has(lineaNegocio)) {
                        this.ccosData.centrosCosto.set(lineaNegocio, new Set());
                    }
                    
                    if (centroCosto) {
                        this.ccosData.centrosCosto.get(lineaNegocio).add(centroCosto);
                        this.ccosData.descripcionesCC.set(centroCosto, descripcion);
                        this.ccosData.ccosAntiguos.set(centroCosto, ccoAntiguo);
                        
                        // Crear relación centro de costo -> proyecto
                        if (proyecto) {
                            if (!this.ccosData.proyectos.has(centroCosto)) {
                                this.ccosData.proyectos.set(centroCosto, new Set());
                            }
                            this.ccosData.proyectos.get(centroCosto).add(proyecto);
                        }
                    }
                }
            });
            
            // Procesar datos adicionales de proyectos
            proyectosData.forEach(item => {
                if (!item.value || !item.label) return;
                
                const codigoProyecto = item.value;
                let descripcionProyecto = '';
                
                // Extraer descripción
                if (item.label && item.label.includes(' - ')) {
                    const parts = item.label.split(' - ');
                    if (parts.length >= 2) {
                        descripcionProyecto = parts[1].trim();
                    }
                } else {
                    descripcionProyecto = item.label;
                }
                
                // Guardar descripción del proyecto
                if (codigoProyecto && descripcionProyecto) {
                    this.ccosData.descripcionesProyecto.set(codigoProyecto, descripcionProyecto);
                }
            });
            
            console.log('Datos de Centros de Costo preparados correctamente:');
            console.log(`- Líneas de negocio: ${this.ccosData.lineasNegocio.size}`);
            console.log(`- Centros de costo: ${this.ccosData.centrosCosto.size}`);
            console.log(`- Proyectos: ${this.ccosData.proyectos.size}`);
        } catch (error) {
            console.error('Error preparando datos de Centros de Costo:', error);
        }
    }

    // Agregar este método dentro de la clase GoogleSheetsDatabase
    prepareProveedoresData() {
        try {
            
            const proveedoresData = this.dataCache['Proveedores'] || [];
            const processedProveedores = proveedoresData.map(item => {
                // Extraer el nombre del proveedor de la parte después del guión en label
                const nombreProveedor = item.label.split(' - ')[1] || ''; 
                const ruc = item.extra1; // RUC está en extra1
                const numeroProveedor = item.extra2 || ''; 
                
                return {
                    value: ruc,
                    label: `${ruc} - ${nombreProveedor} - ${numeroProveedor}`
                };
            });
            
            // Sobrescribir los datos de proveedores
            this.dataCache['Proveedores'] = processedProveedores;
            
        } catch (error) {
            console.error('Error preparando datos de Proveedores:', error);
        }
    }

    /**
     * Método para crear selects dinámicos para una fila
     * @param {HTMLElement} row - Fila donde se crearán los selects
     */
    createSelectsForRow(row) {
        try {
            console.log("Creando selects para nueva fila");
            
            // Crear selects para línea de negocio
            const tdLineaNegocio = row.cells[3];
            const selectLN = document.createElement('select');
            selectLN.className = 'item-lineaNegocio';
            selectLN.innerHTML = '<option value="">Seleccione línea de negocio...</option>';
            
            // Añadir opciones de líneas de negocio desde ccosData
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
            selectProyecto.required = true;
            selectProyecto.innerHTML = '<option value="00000000000">00000000000</option>';

            // Eventos para línea de negocio
            selectLN.addEventListener('change', () => {
                console.log("Línea de negocio cambiada:", selectLN.value);
                const lineaNegocio = selectLN.value;
                searchCC.disabled = !lineaNegocio;
                searchCC.value = '';
                hiddenCC.value = '';
                selectProyecto.innerHTML = '<option value="00000000000">00000000000</option>';
                selectProyecto.disabled = true;

                if (lineaNegocio) {
                    searchCC.disabled = false;
                }
            });

            // Eventos para búsqueda de centro de costo
            searchCC.addEventListener('focus', () => {
                if (!searchCC.disabled) {
                    this.showCentroCostoOptions(searchCC, hiddenCC, optionsCC, selectProyecto);
                }
            });

            searchCC.addEventListener('input', () => {
                if (!searchCC.disabled) {
                    this.showCentroCostoOptions(searchCC, hiddenCC, optionsCC, selectProyecto);
                }
            });

            // Cerrar al hacer click fuera
            document.addEventListener('click', (e) => {
                if (!searchCC.contains(e.target) && !optionsCC.contains(e.target)) {
                    optionsCC.style.display = 'none';
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
            
            console.log("Selects creados correctamente para la nueva fila");
        } catch (error) {
            console.error("Error al crear selects para la fila:", error);
        }
    }

    /**
     * Muestra las opciones de centro de costo filtradas
     * @param {HTMLInputElement} searchCC - Input de búsqueda de centro de costo
     * @param {HTMLInputElement} hiddenCC - Input oculto para centro de costo
     * @param {HTMLElement} optionsCC - Contenedor de opciones
     * @param {HTMLSelectElement} selectProyecto - Select de proyectos
     */
    showCentroCostoOptions(searchCC, hiddenCC, optionsCC, selectProyecto) {
        try {
            // Buscar el select de línea de negocio más cercano (dentro de la misma fila)
            const row = searchCC.closest('tr');
            const lineaNegocio = row.querySelector('.item-lineaNegocio').value;
            const searchTerm = searchCC.value.toLowerCase();
            
            optionsCC.innerHTML = '';
            
            if (!lineaNegocio || !this.ccosData.centrosCosto.has(lineaNegocio)) {
                // Si no hay línea de negocio seleccionada o no hay centros de costo asociados
                return;
            }

            const centrosCosto = Array.from(this.ccosData.centrosCosto.get(lineaNegocio));
            
            // Filtrar según el término de búsqueda
            const filteredCC = searchTerm ? 
                centrosCosto.filter(cc => {
                    const descripcion = this.ccosData.descripcionesCC.get(cc) || '';
                    const ccoAntiguo = this.ccosData.ccosAntiguos.get(cc) || '';
                    
                    return cc.toLowerCase().includes(searchTerm) || 
                           descripcion.toLowerCase().includes(searchTerm) ||
                           ccoAntiguo.toLowerCase().includes(searchTerm);
                }) : centrosCosto;

            // Crear opciones para cada centro de costo filtrado
            filteredCC.forEach(cc => {
                const option = document.createElement('div');
                option.className = 'select-option';
                
                // Mostrar código y descripción
                const descripcion = this.ccosData.descripcionesCC.get(cc) || '';
                option.textContent = cc;
                if (descripcion) {
                    const desc = document.createElement('span');
                    desc.className = 'cc-description';
                    desc.style.marginLeft = '4px';
                    desc.style.fontSize = '0.85em';
                    desc.style.color = '#666';
                    desc.textContent = `- ${descripcion}`;
                    option.appendChild(desc);
                }
                
                option.dataset.value = cc;
                
                option.addEventListener('click', () => {
                    searchCC.value = cc; // Mostrar solo el código en el campo de búsqueda
                    hiddenCC.value = cc; // Guardar el código en el campo oculto
                    optionsCC.style.display = 'none';
                    
                    // Actualizar proyectos disponibles
                    this.updateProyectos(selectProyecto, cc);
                });
                
                optionsCC.appendChild(option);
            });
            
            optionsCC.style.display = filteredCC.length > 0 ? 'block' : 'none';
        } catch (error) {
            console.error("Error al mostrar opciones de centro de costo:", error);
        }
    }

    /**
     * Actualiza los proyectos según el centro de costo seleccionado
     * @param {HTMLSelectElement} selectProyecto - Select de proyectos
     * @param {string} centroCosto - Centro de costo seleccionado
     */
    updateProyectos(selectProyecto, centroCosto) {
        try {
            // Inicializar con la opción de 11 ceros y hacerlo required
            selectProyecto.innerHTML = '<option value="00000000000">00000000000 - Sin Proyecto</option>';
            selectProyecto.disabled = !centroCosto;
            selectProyecto.required = true;

            if (centroCosto && this.ccosData.proyectos.has(centroCosto)) {
                const proyectos = Array.from(this.ccosData.proyectos.get(centroCosto));
                
                // Ordenar proyectos
                proyectos.sort();
                
                proyectos.forEach(proyecto => {
                    // Obtener descripción del proyecto
                    const descripcion = this.ccosData.descripcionesProyecto.get(proyecto) || '';
                    const optionText = descripcion ? `${proyecto} - ${descripcion}` : proyecto;
                    
                    selectProyecto.add(new Option(optionText, proyecto));
                });
                
                console.log(`Proyectos actualizados para CC: ${centroCosto}. Se encontraron ${proyectos.length} proyectos.`);
            } else {
                console.log(`No se encontraron proyectos para el CC: ${centroCosto}`);
            }
        } catch (error) {
            console.error("Error al actualizar proyectos:", error);
        }
    }

    /**
     * Poblar un select con datos
     * @param {string} elementId - ID del elemento select
     * @param {Array} data - Datos para poblar el select
     */
    populateSelect(elementId, data) {
        const select = document.getElementById(elementId);
        if (!select) return;

        select.innerHTML = '<option value="">Seleccione...</option>';
        
        if (!data || !Array.isArray(data)) {
            console.warn(`No hay datos disponibles para poblar ${elementId}`);
            return;
        }
        
        data.forEach(item => {
            if (!item || !item.value) return;
            
            const option = document.createElement('option');
            option.value = item.value;
            option.textContent = item.label || item.value;
            select.appendChild(option);
        });
        
        console.log(`Select ${elementId} poblado con ${data.length} opciones`);
    }

    /**
     * Inicializar un select con búsqueda
     * @param {string} elementId - ID base del elemento
     * @param {Array} data - Datos para el select
     */
    initializeSearchableSelect(elementId, data) {
        const searchInput = document.getElementById(`${elementId}Search`);
        const hiddenInput = document.getElementById(elementId);
        const optionsContainer = document.getElementById(`${elementId}Options`);
        
        if (!searchInput || !optionsContainer || !hiddenInput) {
            console.warn(`No se encontraron los elementos necesarios para ${elementId}`);
            return;
        }
    
        let searchTimeout = null;
        let isValid = false;
    
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
                    option.textContent = item.label || item.value;
                    
                    option.addEventListener('click', () => {
                        if (elementId === 'ruc') {
                            searchInput.value = item.value; // Mostrar solo el RUC
                            
                            // NUEVO: Autocompletar el campo de razón social
                            if (item.label && item.label.includes(' - ')) {
                                const parts = item.label.split(' - ');
                                if (parts.length >= 2) {
                                    const razonSocial = parts[1].trim();
                                    const razonSocialInput = document.getElementById('razonSocial');
                                    if (razonSocialInput) {
                                        razonSocialInput.value = razonSocial;
                                    }
                                }
                            }
                        } else {
                            searchInput.value = item.label || item.value; // Para otros campos, mostrar la etiqueta completa
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
    }

    /**
     * Inicializar campos requeridos
     */
    initializeRequiredFields() {
        const cuentaContableSearch = document.getElementById('cuentaContableSearch');
        const fechaInicioLicencia = document.getElementById('fechaInicioLicencia');
        const fechaFinLicencia = document.getElementById('fechaFinLicencia');
        
        if (!cuentaContableSearch || !fechaInicioLicencia || !fechaFinLicencia) {
            console.warn('No se pudieron encontrar algunos campos para inicializar validaciones de campos requeridos');
            return;
        }
        
        // Cuentas que requieren fechas de licencia
        const cuentasConFechasRequeridas = [
            '6530011000', // MEMBRESIAS
            '6540011000', // SUSCRIPCIONES LICENCIAS SOFTWARE
            '6093515000', // CENDOC: SUSCRIPCIONES Y PUBLICACIONES
            '6093516000'  // CENDOC: BASE DE DATOS EN LINEA
        ];
        
        // Función para verificar si la cuenta actual requiere fechas
        const updateRequiredStatus = () => {
            const currentValue = cuentaContableSearch.value;
            const cuentaCode = currentValue.split(' - ')[0].trim();
            
            // Verificar si la cuenta actual está en la lista de cuentas que requieren fechas
            const requireDates = cuentasConFechasRequeridas.includes(cuentaCode);
            
            // Actualizar el atributo required
            fechaInicioLicencia.required = requireDates;
            fechaFinLicencia.required = requireDates;
            
            // Opcional: Añadir/quitar una clase para resaltar campos requeridos
            if (requireDates) {
                fechaInicioLicencia.classList.add('required-field');
                fechaFinLicencia.classList.add('required-field');
            } else {
                fechaInicioLicencia.classList.remove('required-field');
                fechaFinLicencia.classList.remove('required-field');
            }
        };
        
        // Añadir el evento para actualizar cuando cambia la cuenta
        cuentaContableSearch.addEventListener('change', updateRequiredStatus);
        
        // También verificar cuando se selecciona una opción del dropdown
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('select-option') && 
                e.target.closest('#cuentaContableOptions')) {
                // Dar tiempo a que se actualice el valor
                setTimeout(updateRequiredStatus, 100);
            }
        });
    }

    /**
     * Validar campos de búsqueda antes de exportar
     */
    validateSearchableFields() {
        // Botones que requieren validación
        const buttons = ['exportSolicitudBtn', 'exportERPBtn', 'downloadAllBtn', 'saveFormBtn'];
        
        buttons.forEach(btnId => {
            const btn = document.getElementById(btnId);
            if (!btn) {
                console.warn(`Botón ${btnId} no encontrado para validación`);
                return;
            }
            
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
                        window.exportAllManager.downloadAll();
                        break;
                    case 'saveFormBtn':
                        window.formStorage.saveForm();
                        break;
                }
                
                return true;
            });
        });
    }
    

    /**
     * Método para obtener datos de una hoja específica
     * @param {string} sheetName - Nombre de la hoja
     * @returns {Array} - Datos de la hoja
     */
    getSheetData(sheetName) {
        return this.dataCache[sheetName] || [];
    }
}

// Crear instancia global al cargar
window.googleSheetsDb = new GoogleSheetsDatabase();

// Mensaje cuando el DOM está completamente cargado
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM cargado, verificando instancia de GoogleSheetsDb...');
    if (window.googleSheetsDb) {
        console.log('GoogleSheetsDb instanciado correctamente');
    } else {
        console.error('ERROR: GoogleSheetsDb NO instanciado');
    }
});