"""
Gera app/cadastro.enc.js (cadastro dos técnicos criptografado) a partir de
privado/cadastro.js, que NUNCA deve ser publicado.

O cadastro é cifrado com uma chave aleatória (AES-256-GCM). Essa chave é
guardada uma vez por usuário, cifrada com a senha dele (PBKDF2-SHA256), então
só quem entra pela tela de login consegue abrir o cadastro.

Uso (na pasta do projeto):
  pip install cryptography
  python ferramentas/criptografar_cadastro.py
A senha é pedida no terminal (ou lida da variável REPORT_SENHA).
Rode de novo sempre que mudar o cadastro, os usuários ou a senha.
"""

import base64
import getpass
import json
import os
import re
from pathlib import Path

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

# ===== CONFIGURE AQUI =====
USUARIOS = ["adminTne", "adminTmg", "admin047"]
ITERACOES = 600_000
# ==========================

PASTA = Path(__file__).resolve().parent.parent
ORIGEM = PASTA / "privado" / "cadastro.js"
DESTINO = PASTA / "app" / "cadastro.enc.js"


def _b64(dados: bytes) -> str:
    return base64.b64encode(dados).decode()


def ler_cadastro() -> list:
    texto = ORIGEM.read_text(encoding="utf-8")
    achado = re.search(r"CADASTRO_PADRAO\s*=\s*(\[.*\])\s*;", texto, re.S)
    if not achado:
        raise SystemExit(f"CADASTRO_PADRAO não encontrado em {ORIGEM}")
    # Tira vírgula sobrando antes de "]" para ler como JSON
    return json.loads(re.sub(r",\s*\]", "]", achado.group(1)))


def chave_da_senha(senha: str, salt: bytes) -> bytes:
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITERACOES)
    return kdf.derive(senha.encode("utf-8"))


def main() -> None:
    linhas = ler_cadastro()
    senha = os.environ.get("REPORT_SENHA") or getpass.getpass("Senha dos usuários: ")
    if not senha:
        raise SystemExit("Senha vazia.")

    chave_dados = AESGCM.generate_key(bit_length=256)
    iv_dados = os.urandom(12)
    dados = AESGCM(chave_dados).encrypt(
        iv_dados, json.dumps(linhas, ensure_ascii=False).encode("utf-8"), None
    )

    usuarios = {}
    for usuario in USUARIOS:
        salt, iv = os.urandom(16), os.urandom(12)
        # O nome do usuário entra como dado autenticado: a chave de um não serve para outro
        chave = AESGCM(chave_da_senha(senha, salt)).encrypt(iv, chave_dados, usuario.lower().encode())
        usuarios[usuario.lower()] = {"salt": _b64(salt), "iv": _b64(iv), "chave": _b64(chave)}

    pacote = {"versao": 1, "iteracoes": ITERACOES, "usuarios": usuarios,
              "iv": _b64(iv_dados), "dados": _b64(dados)}
    DESTINO.write_text(
        "'use strict';\n\n"
        "// Gerado por ferramentas/criptografar_cadastro.py. Não edite à mão.\n"
        "// Cadastro dos técnicos criptografado (AES-256-GCM); aberto só pela tela de login.\n"
        f"const CADASTRO_CRIPTOGRAFADO = {json.dumps(pacote, indent=2)};\n",
        encoding="utf-8",
    )
    print(f"{len(linhas)} técnicos criptografados para {len(USUARIOS)} usuários em {DESTINO}")


if __name__ == "__main__":
    main()
