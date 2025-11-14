import os
import requests
from typing import Optional, Dict, List

class GLPIClient:
    def __init__(self, api_url: str = None, app_token: str = None, user_token: str = None):
        self.api_url = (api_url or os.getenv("GLPI_API_URL", "")).rstrip("/")
        self.app_token = app_token or os.getenv("GLPI_APP_TOKEN")
        self.user_token = user_token or os.getenv("GLPI_USER_TOKEN")
        self.session_token = None
        
    def init_session(self) -> bool:
        """Inicializa la sesión con GLPI y obtiene el session_token"""
        try:
            response = requests.get(
                f"{self.api_url}/initSession",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"user_token {self.user_token}",
                    "App-Token": self.app_token
                }
            )
            response.raise_for_status()
            data = response.json()
            self.session_token = data.get("session_token")
            return True
        except Exception as e:
            print(f"Error al iniciar sesión en GLPI: {e}")
            return False
    
    def kill_session(self):
        """Cierra la sesión activa"""
        if not self.session_token:
            return
        try:
            requests.get(
                f"{self.api_url}/killSession",
                headers={
                    "Content-Type": "application/json",
                    "Session-Token": self.session_token,
                    "App-Token": self.app_token
                }
            )
        except Exception as e:
            print(f"Error al cerrar sesión: {e}")
    
    def get_tickets(self, limit: int = 50) -> List[Dict]:
        """Obtiene la lista de tickets"""
        if not self.session_token:
            self.init_session()
        
        try:
            response = requests.get(
                f"{self.api_url}/Ticket",
                headers={
                    "Content-Type": "application/json",
                    "Session-Token": self.session_token,
                    "App-Token": self.app_token
                },
                params={"range": f"0-{limit-1}"}
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            print(f"Error al obtener tickets: {e}")
            return []
    
    def get_ticket(self, ticket_id: int) -> Optional[Dict]:
        """Obtiene un ticket específico por ID"""
        if not self.session_token:
            self.init_session()
        
        try:
            response = requests.get(
                f"{self.api_url}/Ticket/{ticket_id}",
                headers={
                    "Content-Type": "application/json",
                    "Session-Token": self.session_token,
                    "App-Token": self.app_token
                }
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            print(f"Error al obtener ticket {ticket_id}: {e}")
            return None
    
    def create_ticket(self, name: str, content: str, **kwargs) -> Optional[Dict]:
        """Crea un nuevo ticket en GLPI"""
        if not self.session_token:
            self.init_session()
        
        payload = {
            "input": {
                "name": name,
                "content": content,
                **kwargs
            }
        }
        
        try:
            response = requests.post(
                f"{self.api_url}/Ticket",
                headers={
                    "Content-Type": "application/json",
                    "Session-Token": self.session_token,
                    "App-Token": self.app_token
                },
                json=payload
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            print(f"Error al crear ticket: {e}")
            return None
    
    def update_ticket(self, ticket_id: int, **kwargs) -> bool:
        """Actualiza un ticket existente"""
        if not self.session_token:
            self.init_session()
        
        payload = {
            "input": kwargs
        }
        
        try:
            response = requests.put(
                f"{self.api_url}/Ticket/{ticket_id}",
                headers={
                    "Content-Type": "application/json",
                    "Session-Token": self.session_token,
                    "App-Token": self.app_token
                },
                json=payload
            )
            response.raise_for_status()
            return True
        except Exception as e:
            print(f"Error al actualizar ticket {ticket_id}: {e}")
            return False
