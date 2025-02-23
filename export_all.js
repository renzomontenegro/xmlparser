class ExportAllManager {
    constructor() {
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        document.getElementById('downloadAllBtn').addEventListener('click', () => this.downloadAll());
    }

    async downloadAll() {
        // Validar el formulario antes de proceder
        const form = document.getElementById('invoiceForm');
        if (!form.checkValidity()) {
            form.reportValidity();
            return; // Detener la ejecución si no es válido
        }

        try {
            const zip = new JSZip();
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

            // Asegurarnos que los datos estén actualizados antes de la exportación
            window.invoiceParser.updateTotalsAndReferences();
            if (document.getElementById('otrosCargos').value) {
                window.invoiceParser.handleOtrosCargosChange();
            }

            // Obtener los datos actualizados
            const formData = window.invoiceParser.collectFormData();
            
            // Procesar la cuenta contable correctamente
            const cuentaContableFullValue = document.getElementById('cuentaContableSearch').value;
            const cuentaContableCodigo = cuentaContableFullValue.split(' - ')[0].trim();
            
            // Añadir los campos adicionales que faltan
            const additionalFields = {
                tipoFactura: document.getElementById('tipoFactura').value.split('-')[0].trim(),
                numeroComprobanteParte1: document.getElementById('numeroComprobanteParte1').value,
                numeroComprobanteParte2: document.getElementById('numeroComprobanteParte2').value,
                cuentaContableSearch: cuentaContableCodigo // Usar solo el código
            };

            // Combinar los datos
            const completeFormData = {
                ...formData,
                ...additionalFields
            };

            const comprobante = formData.basic.numeroComprobante || 'formulario';

            // 1. Añadir el JSON con los datos completos
            const jsonBlob = new Blob([JSON.stringify(completeFormData, null, 2)], { type: 'application/json' });
            zip.file(`${comprobante}_${timestamp}.json`, jsonBlob);

            // 2. Obtener y añadir el Excel de resumen
            const resumenBlob = await window.excelExporter.exportSolicitud({ returnBlob: true });
            zip.file(`Resumen-Factura-${comprobante}.xlsx`, resumenBlob);

            // 3. Obtener y añadir el Excel ERP
            const erpBlob = await window.excelExporter.exportERP({ returnBlob: true });
            zip.file(`Formato_ERP_${comprobante}.xlsx`, erpBlob);

            // Generar y descargar el ZIP
            const zipBlob = await zip.generateAsync({type: "blob"});
            const zipUrl = URL.createObjectURL(zipBlob);
            const downloadLink = document.createElement('a');
            downloadLink.href = zipUrl;
            downloadLink.download = `Archivos_${comprobante}_${timestamp}.zip`;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
            URL.revokeObjectURL(zipUrl);

        } catch (error) {
            console.error('Error al descargar archivos:', error);
            alert('Error al descargar los archivos: ' + error.message);
        }
    }
}

// Crear instancia global
window.exportAllManager = new ExportAllManager();