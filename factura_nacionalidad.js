// factura_nacionalidad.js - Administra la lógica de factura nacional/extranjera

class FacturaNacionalidadManager {
    constructor() {
        this.initializeElements();
        this.initializeEventListeners();
    }

    initializeElements() {
        this.tipoFacturaNacionalidadSelect = document.getElementById('tipoFacturaNacionalidad');
        this.monedaSelect = document.getElementById('moneda');
        this.tipoMonedaSelect = document.getElementById('tipoMoneda');
        this.porcentajeDetraccionSelect = document.getElementById('porcentajeDetraccion');
        this.codigoBienSelect = document.getElementById('codigoBien');
        this.numeroComprobanteParte1 = document.getElementById('numeroComprobanteParte1');
        this.numeroComprobanteParte2 = document.getElementById('numeroComprobanteParte2');
        this.igvPorcentajeSelect = document.getElementById('igvPorcentaje');
    }

    initializeEventListeners() {
        // Verificar que todos los elementos existan antes de añadir los listeners
        if (!this.tipoFacturaNacionalidadSelect || !this.monedaSelect || !this.tipoMonedaSelect) {
            console.error('No se encontraron los elementos necesarios para la lógica de factura nacionalidad');
            return;
        }

        this.tipoFacturaNacionalidadSelect.addEventListener('change', () => this.handleTipoFacturaNacionalidadChange());
        this.monedaSelect.addEventListener('change', () => this.handleMonedaChange());
        this.tipoMonedaSelect.addEventListener('change', () => this.handleTipoMonedaChange());
        
        // Configuración inicial
        this.handleTipoFacturaNacionalidadChange();
    }

    handleTipoFacturaNacionalidadChange() {
        const tipoFacturaNacionalidad = this.tipoFacturaNacionalidadSelect.value;
        
        // Si la factura es extranjera
        if (tipoFacturaNacionalidad === 'extranjera') {
            // Deshabilitar campos de detracción
            this.porcentajeDetraccionSelect.disabled = true;
            this.porcentajeDetraccionSelect.value = "";
            this.codigoBienSelect.disabled = true;
            this.codigoBienSelect.value = "";
            
            // Cambiar patrones de validación para el número de comprobante
            this.numeroComprobanteParte1.pattern = ".*"; // Cualquier valor
            this.numeroComprobanteParte1.title = "Para facturas extranjeras, no hay restricción de formato";
            
            this.numeroComprobanteParte2.pattern = ".*"; // Cualquier valor
            this.numeroComprobanteParte2.title = "Para facturas extranjeras, no hay restricción de formato";
            
            // Configurar IGV a 0%
            this.igvPorcentajeSelect.value = "0";
            // Disparar un evento para actualizar el valor del IGV
            const event = new Event('change');
            this.igvPorcentajeSelect.dispatchEvent(event);
            
            // Si la moneda es USD, seleccionar automáticamente DOLARES-EXTERIOR
            if (this.monedaSelect.value === 'USD') {
                this.tipoMonedaSelect.value = 'DOLARES-EXTERIOR';
            }
        } else {
            // Si es factura nacional
            // Habilitar campos de detracción
            this.porcentajeDetraccionSelect.disabled = false;
            this.codigoBienSelect.disabled = false;
            
            // Restaurar patrones de validación para el número de comprobante
            this.numeroComprobanteParte1.pattern = "^[A-Za-z0-9]{4}$";
            this.numeroComprobanteParte1.title = "Debe contener exactamente 4 caracteres";
            
            this.numeroComprobanteParte2.pattern = "^\\d{8}$";
            this.numeroComprobanteParte2.title = "Debe contener 8 dígitos (use ceros a la izquierda si es necesario)";
            
            // Por defecto IGV a 18% (mantenemos el valor actual si ya está configurado)
            if (this.igvPorcentajeSelect.value === "0") {
                this.igvPorcentajeSelect.value = "18";
                // Disparar un evento para actualizar el valor del IGV
                const event = new Event('change');
                this.igvPorcentajeSelect.dispatchEvent(event);
            }
            
            // Ajustar tipo de moneda según la moneda seleccionada
            if (this.monedaSelect.value === 'PEN') {
                this.tipoMonedaSelect.value = 'SOLES-NACIONAL';
            } else if (this.monedaSelect.value === 'USD') {
                this.tipoMonedaSelect.value = 'DOLARES-NACIONAL';
            }
        }
    }

    handleMonedaChange() {
        if (this.monedaSelect.value === 'PEN') {
            // Si se selecciona PEN, solo puede ser SOLES-NACIONAL
            this.tipoMonedaSelect.value = 'SOLES-NACIONAL';
            
            // Asegurar que no sea factura extranjera si es en soles
            if (this.tipoFacturaNacionalidadSelect.value === 'extranjera') {
                this.tipoFacturaNacionalidadSelect.value = 'nacional';
                this.handleTipoFacturaNacionalidadChange(); // Actualizar todos los campos
            }
        } else if (this.monedaSelect.value === 'USD') {
            // Si es USD, depende de si es nacional o extranjera
            if (this.tipoFacturaNacionalidadSelect.value === 'extranjera') {
                this.tipoMonedaSelect.value = 'DOLARES-EXTERIOR';
            } else {
                this.tipoMonedaSelect.value = 'DOLARES-NACIONAL';
            }
        }
    }

    handleTipoMonedaChange() {
        switch (this.tipoMonedaSelect.value) {
            case 'SOLES-NACIONAL':
                this.monedaSelect.value = 'PEN';
                this.tipoFacturaNacionalidadSelect.value = 'nacional';
                break;
            case 'DOLARES-NACIONAL':
                this.monedaSelect.value = 'USD';
                this.tipoFacturaNacionalidadSelect.value = 'nacional';
                break;
            case 'DOLARES-EXTERIOR':
                this.monedaSelect.value = 'USD';
                this.tipoFacturaNacionalidadSelect.value = 'extranjera';
                break;
        }
        
        // Actualizar los campos relacionados con el tipo de factura
        this.handleTipoFacturaNacionalidadChange();
    }
}

// Exportar funciones para acceso global
window.handleTipoFacturaNacionalidadChange = function() {
    if (window.facturaNacionalidadManager) {
        window.facturaNacionalidadManager.handleTipoFacturaNacionalidadChange();
    }
};

// Inicializar cuando el DOM esté cargado
document.addEventListener('DOMContentLoaded', () => {
    // Verificar si los elementos existen antes de inicializar
    if (document.getElementById('tipoFacturaNacionalidad') && 
        document.getElementById('moneda') && 
        document.getElementById('tipoMoneda')) {
        window.facturaNacionalidadManager = new FacturaNacionalidadManager();
    }
});