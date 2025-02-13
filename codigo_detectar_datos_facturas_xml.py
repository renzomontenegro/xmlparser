import xml.etree.ElementTree as ET
from datetime import datetime
from decimal import Decimal
import re
from typing import Dict, Optional

class InvoiceParser:
    def __init__(self):
        self.namespaces = {
            'cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
            'cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
            'sac': 'urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1'
        }

    def safe_find_text(self, element: ET.Element, path: str, default: str = '') -> str:
        try:
            found = element.find(path, self.namespaces)
            return found.text.strip() if found is not None and found.text else default
        except (AttributeError, TypeError):
            return default

    def safe_find_attr(self, element: ET.Element, path: str, attr: str, default: str = '') -> str:
        try:
            found = element.find(path, self.namespaces)
            return found.get(attr, default) if found is not None else default
        except (AttributeError, TypeError):
            return default

    def clean_xml(self, xml_content: str) -> str:
        """Limpia el XML de declaraciones múltiples y elementos problemáticos"""
        # Remover BOM si existe
        xml_content = xml_content.strip().lstrip('\ufeff')
        
        # Dividir en líneas y procesar
        lines = xml_content.splitlines()
        cleaned_lines = []
        xml_declaration_found = False
        
        for line in lines:
            line = line.strip()
            if '<?xml' in line:
                if not xml_declaration_found:
                    cleaned_lines.append(line)
                    xml_declaration_found = True
            elif '<?xml-stylesheet' in line:
                continue
            else:
                cleaned_lines.append(line)
        
        return '\n'.join(cleaned_lines)

    def parse_invoice(self, xml_content: str) -> Dict:
        try:
            # Limpiar XML
            cleaned_xml = self.clean_xml(xml_content)
            
            # Parsear XML
            root = ET.fromstring(cleaned_xml)

            # Información básica de la factura
            invoice_data = {
                'invoice_number': self.safe_find_text(root, './/cbc:ID'),
                'issue_date': self.safe_find_text(root, './/cbc:IssueDate'),
                'currency': self.safe_find_text(root, './/cbc:DocumentCurrencyCode'),
                'amount_text': self.safe_find_text(root, './/cbc:Note[@languageLocaleID="1000"]'),
                'order_reference': self.safe_find_text(root, './/cac:OrderReference/cbc:ID')
            }

            # Información del proveedor
            supplier = {
                'ruc': self.safe_find_text(root, './/cac:AccountingSupplierParty//cbc:ID'),
                'name': self.safe_find_text(root, './/cac:AccountingSupplierParty//cbc:RegistrationName'),
                'address': self.safe_find_text(root, './/cac:AccountingSupplierParty//cac:RegistrationAddress/cac:AddressLine/cbc:Line'),
                'district': self.safe_find_text(root, './/cac:AccountingSupplierParty//cbc:District'),
                'city': self.safe_find_text(root, './/cac:AccountingSupplierParty//cbc:CityName')
            }

            # Información del cliente
            customer = {
                'ruc': self.safe_find_text(root, './/cac:AccountingCustomerParty//cbc:ID'),
                'name': self.safe_find_text(root, './/cac:AccountingCustomerParty//cbc:RegistrationName'),
                'address': self.safe_find_text(root, './/cac:AccountingCustomerParty//cac:AddressLine/cbc:Line'),
                'district': self.safe_find_text(root, './/cac:AccountingCustomerParty//cbc:District'),
                'city': self.safe_find_text(root, './/cac:AccountingCustomerParty//cbc:CityName')
            }

            # Información de totales
            tax_total = self.safe_find_text(root, './/cac:TaxTotal/cbc:TaxAmount')
            payable_amount = self.safe_find_text(root, './/cac:LegalMonetaryTotal/cbc:PayableAmount')
            
            totals = {
                'tax_total': float(tax_total) if tax_total else 0.0,
                'payable_amount': float(payable_amount) if payable_amount else 0.0
            }

            # Líneas de factura
            invoice_lines = []
            for line in root.findall('.//cac:InvoiceLine', self.namespaces):
                line_data = {
                    'id': self.safe_find_text(line, 'cbc:ID'),
                    'description': self.safe_find_text(line, './/cac:Item/cbc:Description'),
                    'quantity': self.safe_find_text(line, 'cbc:InvoicedQuantity'),
                    'price': self.safe_find_text(line, './/cac:Price/cbc:PriceAmount'),
                    'line_total': self.safe_find_text(line, 'cbc:LineExtensionAmount')
                }
                invoice_lines.append(line_data)

            return {
                'invoice_data': invoice_data,
                'supplier': supplier,
                'customer': customer,
                'totals': totals,
                'invoice_lines': invoice_lines
            }

        except ET.ParseError as e:
            raise ValueError(f"Error al parsear XML: {str(e)}")
        except Exception as e:
            raise ValueError(f"Error inesperado: {str(e)}")

def process_invoice(xml_content: str) -> Dict:
    """Función wrapper para procesar facturas"""
    parser = InvoiceParser()
    try:
        return parser.parse_invoice(xml_content)
    except Exception as e:
        print(f"Error procesando factura: {str(e)}")
        return {}

def print_invoice_summary(invoice_data: Dict) -> None:
    """Imprime un resumen formateado de la factura"""
    if not invoice_data:
        print("No hay datos de factura para mostrar")
        return

    print("\n=== RESUMEN DE FACTURA ===")
    print(f"Número: {invoice_data['invoice_data']['invoice_number']}")
    print(f"Fecha: {invoice_data['invoice_data']['issue_date']}")
    print(f"Moneda: {invoice_data['invoice_data']['currency']}")
    
    print("\nPROVEEDOR:")
    print(f"RUC: {invoice_data['supplier']['ruc']}")
    print(f"Nombre: {invoice_data['supplier']['name']}")
    
    print("\nCLIENTE:")
    print(f"RUC: {invoice_data['customer']['ruc']}")
    print(f"Nombre: {invoice_data['customer']['name']}")
    
    print("\nTOTALES:")
    print(f"IGV: {invoice_data['totals']['tax_total']:.2f}")
    print(f"Total: {invoice_data['totals']['payable_amount']:.2f}")
    
    print("\nDETALLES:")
    for line in invoice_data['invoice_lines']:
        print(f"\n- {line['description']}")
        print(f"  Cantidad: {line['quantity']}")
        print(f"  Precio: {line['price']}")
        print(f"  Subtotal: {line['line_total']}")