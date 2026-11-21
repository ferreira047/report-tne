"""
Gera app/cadastro.enc.js (cadastro dos técnicos criptografado) a partir de
privado/cadastro.js, que NUNCA deve ser publicado.

O cadastro é cifrado com uma chave aleatória (AES-256-GCM). Essa chave é
guardada uma vez por usuário, cifrada com a senha dele (PBKDF2-SHA256), então
só quem entra pela tela de login consegue abrir o cadastro.

Usuários do perfil Genesis (USUARIOS_GENESIS) só entram no Report Genesis
(genesis.html) e não recebem a chave do cadastro: a senha deles abre apenas uma
marca de verificação.

Uso (na pasta do projeto):
  pip install cryptography
  python ferramentas/criptografar_cadastro.py            # tudo (precisa de privado/cadastro.js)
  python ferramentas/criptografar_cadastro.py --genesis  # só os usuários Genesis
As senhas são pedidas no terminal (ou lidas de REPORT_SENHA e REPORT_SENHA_GENESIS).
Com --genesis o cadastro e os admins de app/cadastro.enc.js ficam como estão.
Rode de novo sempre que mudar o cadastro, os usuários ou a senha.
"""

import base64
import getpass
import json
import os
import re
import sys
from pathlib import Path

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

# ===== CONFIGURE AQUI =====
USUARIOS = ["adminTne", "adminTmg", "admin047"]
USUARIOS_GENESIS = ["brunoserpa1@tlp.com", "ralph1@tlp.com"]  # perfil que só acessa o Report Genesis
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


def pedir_senha(variavel: str, pergunta: str) -> str:
    senha = os.environ.get(variavel) or getpass.getpass(pergunta)
    if not senha:
        raise SystemExit("Senha vazia.")
    return senha


def entradas_genesis(senha: str) -> dict:
    # A senha abre só a marca "genesis"; o perfil entra como dado autenticado,
    # então trocar o perfil no arquivo faz o login falhar.
    entradas = {}
    for usuario in USUARIOS_GENESIS:
        salt, iv = os.urandom(16), os.urandom(12)
        aad = f"{usuario.lower()}|genesis".encode()
        marca = AESGCM(chave_da_senha(senha, salt)).encrypt(iv, b"genesis", aad)
        entradas[usuario.lower()] = {"perfil": "genesis", "salt": _b64(salt), "iv": _b64(iv), "chave": _b64(marca)}
    return entradas


def gravar(pacote: dict) -> None:
    DESTINO.write_text(
        "'use strict';\n\n"
        "// Gerado por ferramentas/criptografar_cadastro.py. Não edite à mão.\n"
        "// Cadastro dos técnicos criptografado (AES-256-GCM); aberto só pela tela de login.\n"
        f"const CADASTRO_CRIPTOGRAFADO = {json.dumps(pacote, indent=2)};\n",
        encoding="utf-8",
    )


def ler_pacote_atual() -> dict:
    texto = DESTINO.read_text(encoding="utf-8")
    return json.loads(texto[texto.index("{"):texto.rindex("}") + 1])


def so_genesis() -> None:
    pacote = ler_pacote_atual()
    senha = pedir_senha("REPORT_SENHA_GENESIS", "Senha do perfil Genesis: ")
    # Tira usuários Genesis antigos e grava os da lista atual; admins e cadastro ficam iguais.
    usuarios = {nome: entrada for nome, entrada in pacote["usuarios"].items() if entrada.get("perfil") != "genesis"}
    usuarios.update(entradas_genesis(senha))
    pacote["usuarios"] = usuarios
    gravar(pacote)
    print(f"{len(USUARIOS_GENESIS)} usuário(s) Genesis gravado(s) em {DESTINO}")


def main() -> None:
    if "--genesis" in sys.argv[1:]:
        so_genesis()
        return
    linhas = ler_cadastro()
    senha = pedir_senha("REPORT_SENHA", "Senha dos usuários: ")
    senha_genesis = pedir_senha("REPORT_SENHA_GENESIS", "Senha do perfil Genesis: ") if USUARIOS_GENESIS else ""

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
    if USUARIOS_GENESIS:
        usuarios.update(entradas_genesis(senha_genesis))

    pacote = {"versao": 1, "iteracoes": ITERACOES, "usuarios": usuarios,
              "iv": _b64(iv_dados), "dados": _b64(dados)}
    gravar(pacote)
    print(f"{len(linhas)} técnicos criptografados para {len(USUARIOS)} usuários "
          f"(+{len(USUARIOS_GENESIS)} Genesis) em {DESTINO}")


if __name__ == "__main__":
    main()
