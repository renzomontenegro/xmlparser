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
        
    }

    /**
     * Inicializa la base de datos cargando todas las hojas
     * @returns {Promise<void>}
     */
    async initializeDatabase() {
        try {
            const loadPromises = this.sheetsToLoad.filter(sheet => sheet !== 'Proyectos')
                .map(async (sheet) => {
                    const data = await this.fetchSheetData(sheet);
                    return data;
                });
    
            await Promise.all(loadPromises);
            
            this.prepareCCOsData();
            this.prepareProveedoresData();
            
            this.initializeSelectors();
            this.initializeRequiredFields();
            this.validateSearchableFields();
        } catch (error) {
            console.error('Error en initializeDatabase:', error);
            alert('Error al cargar datos desde Google Sheets.');
        }
    }

    /**
     * Recupera los datos de una hoja específica
     * @param {string} sheetName - Nombre de la hoja a cargar
     * @returns {Promise<Array>} - Datos de la hoja
     */
    async fetchSheetData(sheetName) {
        try {
            const startTime = performance.now();
            
            const response = await fetch(`${this.API_ENDPOINT}?sheet=${sheetName}`);
            
            if (!response.ok) {
                console.error(`Error HTTP: ${response.status}`);
                const errorText = await response.text();
                console.error(`Detalle del error: ${errorText}`);
                throw new Error(`Error al cargar la hoja ${sheetName}: ${response.statusText}`);
            }
            
            const data = await response.json();
            const endTime = performance.now();
            
            console.log(`Hoja ${sheetName} cargada en ${(endTime-startTime)/1000} segundos`);
            
            
            // Guardar en caché
            this.dataCache[sheetName] = data[sheetName] || [];
            
            return this.dataCache[sheetName];
        } catch (error) {
            console.error(`Error recuperando datos de ${sheetName}:`, error);
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
            // Reiniciar estructura de datos
            this.ccosData = {
                lineasNegocio: new Set(),
                centrosCosto: new Map(),
                proyectos: new Map(),
                descripcionesCC: new Map(),
                ccosAntiguos: new Map(),
                descripcionesProyecto: new Map()
            };
    
            const ccosData = this.dataCache['CCOs'] || [];
            
            // Imprimir algunos registros para ver su estructura
            console.log('Muestra de registros CCOs:', ccosData.slice(0, 5));
            
            // Primera pasada: recopilar todas las líneas de negocio
            ccosData.forEach(item => {
                // Buscar línea de negocio en extra1
                const lineaNegocio = item.extra1 || '';
                if (lineaNegocio && lineaNegocio.trim() !== '') {
                    this.ccosData.lineasNegocio.add(lineaNegocio);
                }
                
                // Buscar proyecto en extra3
                const proyecto = item.extra3 || '';
                
                // Si hay proyecto, guardar su descripción (viene en el label)
                if (proyecto && proyecto.trim() !== '') {
                    const descripcion = item.label ? (item.label.includes(' - ') ? 
                        item.label.split(' - ')[1].trim() : item.label) : '';
                    
                    if (descripcion) {
                        this.ccosData.descripcionesProyecto.set(proyecto, descripcion);
                    }
                }
            });
    
            // Segunda pasada: procesar centros de costo y proyectos
            ccosData.forEach(item => {
                const lineaNegocio = item.extra1 || '';
                const centroCosto = item.extra2 || '';
                const proyecto = item.extra3 || '';
                const ccoAntiguo = item.extra4 || ''; 
                
                // Extraer descripción del centro de costo
                const descripcion = item.label ? (item.label.includes(' - ') ? 
                    item.label.split(' - ')[1].trim() : item.label) : '';
    
                // Procesar si hay línea de negocio y centro de costo
                if (lineaNegocio && centroCosto) {
                    if (!this.ccosData.centrosCosto.has(lineaNegocio)) {
                        this.ccosData.centrosCosto.set(lineaNegocio, new Set());
                    }
                    
                    this.ccosData.centrosCosto.get(lineaNegocio).add(centroCosto);
                    
                    // Guardar descripción del centro de costo
                    if (descripcion) {
                        this.ccosData.descripcionesCC.set(centroCosto, descripcion);
                    }

                    // Guardar centro de costo antiguo si existe
                    if (ccoAntiguo && ccoAntiguo.trim() !== '') {
                        this.ccosData.ccosAntiguos.set(centroCosto, ccoAntiguo);
                    }
                    
                    // Procesar proyecto
                    if (proyecto && proyecto.trim() !== '') {
                        if (!this.ccosData.proyectos.has(centroCosto)) {
                            this.ccosData.proyectos.set(centroCosto, new Set());
                        }
                        this.ccosData.proyectos.get(centroCosto).add(proyecto);
                    }
                }
            });
            
            // Imprimir información de proyectos para diagnóstico
            console.log('Total de proyectos con descripción:', this.ccosData.descripcionesProyecto.size);
            
        } catch (error) {
            console.error('Error al preparar datos de Centros de Costo:', error);
        }
    }

    async loadProjectDescriptions() {
        try {
            if (!this.dataCache['Proyectos']) {
                const proyectosData = await this.fetchSheetData('Proyectos');
                if (proyectosData) {
                    proyectosData.forEach(item => {
                        const projectCode = item.value;
                        const projectDesc = item.label.split(' - ')[1] || '';
                        
                        if (projectCode && projectDesc) {
                            this.ccosData.descripcionesProyecto.set(projectCode, projectDesc);
                        }
                    });
                }
            }
        } catch (error) {
            console.error('Error loading project descriptions:', error);
        }
    }

    // Agregar este método dentro de la clase GoogleSheetsDatabase
    prepareProveedoresData() {
        try {
            const proveedoresData = this.dataCache['Proveedores'] || [];
            const processedProveedores = proveedoresData.map(item => {
                // Extract supplier name from label (after dash)
                const nombreProveedor = item.label.split(' - ')[1] || ''; 
                const ruc = item.extra1; // RUC is in extra1
                const numeroProveedor = item.extra2 || ''; 
                
                return {
                    value: ruc, // Use RUC as value
                    label: `${ruc} - ${nombreProveedor} - ${numeroProveedor}`
                };
            });
            
            // Override provider data with processed data
            this.dataCache['Proveedores'] = processedProveedores;
        } catch (error) {
            console.error('Error preparing Providers data:', error);
        }
    }

    /**
     * Método para crear selects dinámicos para una fila
     * @param {HTMLElement} row - Fila donde se crearán los selects
     */
    createSelectsForRow(row) {
        try {
            // Crear selects para línea de negocio
            const tdLineaNegocio = row.cells[3];
            const selectLN = document.createElement('select');
            selectLN.className = 'item-lineaNegocio';
            selectLN.innerHTML = '<option value="">Seleccione línea de negocio...</option>';
            
            // Verificar si hay líneas de negocio y agregarlas al selector
            if (this.ccosData.lineasNegocio.size === 0) {
                console.warn('No se encontraron líneas de negocio en los datos');
            } else {
                // Ordenar las líneas de negocio para mejor presentación
                Array.from(this.ccosData.lineasNegocio).sort().forEach(ln => {
                    selectLN.add(new Option(ln, ln));
                });
            }
    
            // Crear búsqueda para centro de costo
            const tdCentroCosto = row.cells[4];
            const containerCC = document.createElement('div');
            containerCC.className = 'search-container';
            const searchCC = document.createElement('input');
            searchCC.type = 'text';
            searchCC.className = 'item-centroCosto-search';
            searchCC.placeholder = 'Buscar centro de costo...';
            searchCC.disabled = true;

            // Prevenir caracteres no numéricos en el input
            searchCC.addEventListener('keypress', (e) => {
                // Permitir solo números y teclas de control como backspace, delete, etc.
                if (!/^\d$/.test(e.key) && !e.ctrlKey && !e.metaKey && e.key !== 'Backspace' && e.key !== 'Delete' && e.key !== 'Tab') {
                    e.preventDefault();
                }
            });

            // Limpiar caracteres no numéricos si se pega contenido
            searchCC.addEventListener('paste', (e) => {
                // Prevenir la acción predeterminada de pegar
                e.preventDefault();
                
                // Obtener el texto pegado
                const pastedText = (e.clipboardData || window.clipboardData).getData('text');
                
                // Filtrar solo los dígitos
                const cleanText = pastedText.replace(/\D/g, '');
                
                // Insertar el texto limpio en la posición del cursor
                document.execCommand('insertText', false, cleanText);
            });
            // FIN DEL CÓDIGO DE VALIDACIÓN

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
            selectProyecto.innerHTML = '<option value="00000000000">00000000000 - Sin Proyecto</option>';
    
            // Eventos
            selectLN.addEventListener('change', () => {
                const lineaNegocio = selectLN.value;
                searchCC.disabled = !lineaNegocio;
                searchCC.value = '';
                hiddenCC.value = '';
                selectProyecto.innerHTML = '<option value="00000000000">00000000000 - Sin Proyecto</option>';
                selectProyecto.disabled = true;
    
                if (lineaNegocio) {
                    searchCC.disabled = false;
                }
            });
    
            // Mostrar opciones al hacer focus o click - CORREGIDO
            searchCC.addEventListener('focus', () => {
                if (!searchCC.disabled) {
                    // Obtener lineaNegocio del select en el momento del evento
                    const lineaNegocio = selectLN.value;
                    this.showCentroCostoOptions(lineaNegocio, searchCC, hiddenCC, optionsCC, selectProyecto);
                }
            });
    
            searchCC.addEventListener('click', () => {
                if (!searchCC.disabled) {
                    // Obtener lineaNegocio del select en el momento del evento
                    const lineaNegocio = selectLN.value;
                    this.showCentroCostoOptions(lineaNegocio, searchCC, hiddenCC, optionsCC, selectProyecto);
                }
            });
    
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
                            ccoAntiguo.includes(searchTerm); // Buscar también por CC Antiguo
                    });
            
                    filteredCC.forEach(cc => {
                        const option = document.createElement('div');
                        option.className = 'select-option';
                        
                        // Solo mostrar el código CC sin descripción
                        option.textContent = cc;
                        option.dataset.value = cc;
                        
                        option.addEventListener('click', () => {
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
        } catch (error) {
            console.error('Error al crear selectores para la fila:', error);
        }
    }
    
    
    
    updateProyectos(selectProyecto, centroCosto) {
        // Inicializar con la opción por defecto
        selectProyecto.innerHTML = '<option value="00000000000">00000000000 - Sin Proyecto</option>';
        selectProyecto.disabled = !centroCosto;
        
        if (!centroCosto) return;
        
        // Verificar si hay proyectos para este centro de costo
        if (this.ccosData.proyectos.has(centroCosto)) {
            const proyectos = Array.from(this.ccosData.proyectos.get(centroCosto));
            
            // Ordenar proyectos para mejor experiencia
            proyectos.sort();
            
            proyectos.forEach(proyecto => {
                // Ignorar la opción por defecto si ya está añadida
                if (proyecto === '00000000000') return;
                
                // Obtener descripción del proyecto
                const descripcion = this.ccosData.descripcionesProyecto.get(proyecto) || '';
                const optionText = descripcion ? `${proyecto} - ${descripcion}` : proyecto;
                
                // Añadir la opción al selector
                selectProyecto.add(new Option(optionText, proyecto));
            });
        }
    }

    mostrarOpcionesCentroCosto(searchCC, hiddenCC, optionsCC, selectProyecto, lineaNegocio) {
        if (searchCC.disabled) return;
        
        const searchTerm = searchCC.value.toLowerCase();
        optionsCC.innerHTML = '';
        
        if (!this.ccosData.centrosCosto.has(lineaNegocio)) {
            console.warn(`No hay centros de costo para la línea ${lineaNegocio}`);
            return;
        }
        
        const centrosCosto = Array.from(this.ccosData.centrosCosto.get(lineaNegocio));
        const filteredCC = searchTerm ? 
            centrosCosto.filter(cc => {
                const descripcion = this.ccosData.descripcionesCC.get(cc) || '';
                const ccoAntiguo = this.ccosData.ccosAntiguos.get(cc) || '';
                return cc.toLowerCase().includes(searchTerm) || 
                        descripcion.toLowerCase().includes(searchTerm) ||
                        ccoAntiguo.toLowerCase().includes(searchTerm);
            }) : centrosCosto;
        
        // Ordenar centros de costo para mejor experiencia
        filteredCC.sort();
        
        filteredCC.forEach(cc => {
            const option = document.createElement('div');
            option.className = 'select-option';
            
            // Obtener descripción si existe
            const descripcion = this.ccosData.descripcionesCC.get(cc) || '';
            
            // Formatear la opción: código + descripción
            option.innerHTML = `
                <span class="cc-main-content">${cc}</span>
                ${descripcion ? `<span class="cc-description"> - ${descripcion}</span>` : ''}
            `;
            
            option.dataset.value = cc;
            
            // Configurar evento de selección
            option.addEventListener('click', () => {
                // Usar solo el código en el campo de búsqueda visible
                searchCC.value = cc;
                hiddenCC.value = cc;
                optionsCC.style.display = 'none';
                
                // Actualizar opciones de proyecto
                this.updateProyectos(selectProyecto, cc);
            });
            
            optionsCC.appendChild(option);
        });
        
        optionsCC.style.display = filteredCC.length > 0 ? 'block' : 'none';
    }
    
    filtrarOpcionesCentroCosto(searchTerm, lineaNegocio, optionsCC, searchCC, hiddenCC, selectProyecto) {
        if (!this.ccosData.centrosCosto.has(lineaNegocio)) return;
        
        optionsCC.innerHTML = '';
        
        const centrosCosto = Array.from(this.ccosData.centrosCosto.get(lineaNegocio));
        const filteredCC = centrosCosto.filter(cc => {
            const descripcion = this.ccosData.descripcionesCC.get(cc) || '';
            const ccoAntiguo = this.ccosData.ccosAntiguos.get(cc) || '';
            return cc.toLowerCase().includes(searchTerm) || 
                    descripcion.toLowerCase().includes(searchTerm) ||
                    ccoAntiguo.toLowerCase().includes(searchTerm);
        });
        
        // Ordenar centros de costo
        filteredCC.sort();
        
        filteredCC.forEach(cc => {
            const option = document.createElement('div');
            option.className = 'select-option';
            
            const descripcion = this.ccosData.descripcionesCC.get(cc) || '';
            
            option.innerHTML = `
                <span class="cc-main-content">${cc}</span>
                ${descripcion ? `<span class="cc-description"> - ${descripcion}</span>` : ''}
            `;
            
            option.dataset.value = cc;
            
            option.addEventListener('click', () => {
                searchCC.value = cc;
                hiddenCC.value = cc;
                optionsCC.style.display = 'none';
                this.updateProyectos(selectProyecto, cc);
            });
            
            optionsCC.appendChild(option);
        });
        
        optionsCC.style.display = filteredCC.length > 0 ? 'block' : 'none';
    }
    
    
    updateProyectos(selectProyecto, centroCosto) {
        // Inicializar con la opción por defecto
        selectProyecto.innerHTML = '<option value="00000000000">00000000000 - Sin Proyecto</option>';
        selectProyecto.disabled = !centroCosto;
        selectProyecto.required = true;
        
        if (!centroCosto) return;
        
        // Verificar si hay proyectos para este centro de costo
        if (this.ccosData.proyectos.has(centroCosto)) {
            const proyectos = Array.from(this.ccosData.proyectos.get(centroCosto));
            
            // Ordenar proyectos para mejor experiencia
            proyectos.sort();
            
            proyectos.forEach(proyecto => {
                // Ignorar la opción por defecto que ya añadimos
                if (proyecto === '00000000000') return;
                
                // Obtener descripción del proyecto
                const descripcion = this.ccosData.descripcionesProyecto.get(proyecto) || '';
                const optionText = descripcion ? `${proyecto} - ${descripcion}` : proyecto;
                
                // Añadir la opción al selector
                const option = document.createElement('option');
                option.value = proyecto;
                option.textContent = optionText;
                selectProyecto.appendChild(option);
            });
        }
    }
    
    

    /**
     * Muestra las opciones de centro de costo filtradas
     * @param {HTMLInputElement} searchCC - Input de búsqueda de centro de costo
     * @param {HTMLInputElement} hiddenCC - Input oculto para centro de costo
     * @param {HTMLElement} optionsCC - Contenedor de opciones
     * @param {HTMLSelectElement} selectProyecto - Select de proyectos
     */
    showCentroCostoOptions(lineaNegocio, searchCC, hiddenCC, optionsCC, selectProyecto) {
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
    }

    /**
     * Actualiza los proyectos según el centro de costo seleccionado
     * @param {HTMLSelectElement} selectProyecto - Select de proyectos
     * @param {string} centroCosto - Centro de costo seleccionado
     */
    updateProyectos(selectProyecto, centroCosto) {
        // Inicializar con la opción de 11 ceros y hacerlo required
        selectProyecto.innerHTML = '<option value="00000000000">00000000000 - Sin Proyecto</option>';
        selectProyecto.disabled = !centroCosto;
        selectProyecto.required = true;
    
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
                            searchInput.value = item.value; // Only show the RUC code
                            
                            // Auto-populate company name if available
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
                            searchInput.value = item.label; // For other fields, show the full label with description
                        }
                        
                        hiddenInput.value = item.value; // Always save only the code in the hidden input
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
    if (window.googleSheetsDb) {
    } else {
        console.error('ERROR: GoogleSheetsDb NO instanciado');
    }
});