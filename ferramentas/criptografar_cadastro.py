"""
Gera app/cadastro.enc.js (cadastro dos técnicos criptografado) a partir de
privado/cadastro.js, que NUNCA deve ser publicado.

O cadastro é cifrado com uma chave aleatória (AES-256-GCM). Essa chave é
guardada uma vez por usuário, cifrada com a senha dele (PBKDF2-SHA256), então
só quem entra pela tela de login consegue abrir o cadastro.

Usuários do perfil Genesis (USUARIOS_GENESIS) só entram no Report Genesis
(genesis.html) e não recebem a chave do cadastro: a senha deles abre apenas uma
marca de verificação.

Admins com senha própria (ADMINS_EXTRA) têm o mesmo acesso dos admins de
USUARIOS, mas outra senha.

Uso (na pasta do projeto):
  pip install cryptography
  python ferramentas/criptografar_cadastro.py                 # tudo (precisa de privado/cadastro.js)
  python ferramentas/criptografar_cadastro.py --genesis       # só os usuários Genesis
  python ferramentas/criptografar_cadastro.py --admins-extra  # só os ADMINS_EXTRA
As senhas são pedidas no terminal (ou lidas de REPORT_SENHA, REPORT_SENHA_GENESIS
e REPORT_SENHA_EXTRA). Com --genesis ou --admins-extra o cadastro e os demais
usuários de app/cadastro.enc.js ficam como estão; --admins-extra pede a senha
atual dos admins para abrir a chave do cadastro.
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
ADMINS_EXTRA = ["brunoserpa1@tlp.com", "ralph1@tlp.com"]  # mesmo acesso dos admins, senha própria
USUARIOS_GENESIS = []  # perfil que só acessa o Report Genesis
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


def entrada_admin(usuario: str, senha: str, chave_dados: bytes, extra: bool = False) -> dict:
    # O nome do usuário entra como dado autenticado: a chave de um não serve para outro
    salt, iv = os.urandom(16), os.urandom(12)
    chave = AESGCM(chave_da_senha(senha, salt)).encrypt(iv, chave_dados, usuario.lower().encode())
    entrada = {"salt": _b64(salt), "iv": _b64(iv), "chave": _b64(chave)}
    if extra:
        entrada["grupo"] = "admin-extra"  # só marca a origem; o site trata como admin
    return entrada


def abrir_chave_dados(pacote: dict, senha: str) -> bytes:
    for usuario in USUARIOS:
        entrada = pacote["usuarios"].get(usuario.lower())
        if not entrada or entrada.get("perfil"):
            continue
        try:
            chave = chave_da_senha(senha, base64.b64decode(entrada["salt"]))
            return AESGCM(chave).decrypt(base64.b64decode(entrada["iv"]), base64.b64decode(entrada["chave"]),
                                         usuario.lower().encode())
        except Exception:
            continue
    raise SystemExit("Senha dos admins não confere com app/cadastro.enc.js.")


def so_admins_extra() -> None:
    pacote = ler_pacote_atual()
    chave_dados = abrir_chave_dados(pacote, pedir_senha("REPORT_SENHA", "Senha atual dos admins: "))
    senha = pedir_senha("REPORT_SENHA_EXTRA", "Senha dos ADMINS_EXTRA: ")
    novos = {usuario.lower() for usuario in ADMINS_EXTRA}
    # Tira admins extra antigos e qualquer entrada antiga desses nomes (ex.: perfil Genesis).
    usuarios = {nome: entrada for nome, entrada in pacote["usuarios"].items()
                if entrada.get("grupo") != "admin-extra" and nome not in novos}
    for usuario in ADMINS_EXTRA:
        usuarios[usuario.lower()] = entrada_admin(usuario, senha, chave_dados, extra=True)
    pacote["usuarios"] = usuarios
    gravar(pacote)
    print(f"{len(ADMINS_EXTRA)} admin(s) extra gravado(s) em {DESTINO}")


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
    if "--admins-extra" in sys.argv[1:]:
        so_admins_extra()
        return
    linhas = ler_cadastro()
    senha = pedir_senha("REPORT_SENHA", "Senha dos usuários: ")
    senha_extra = pedir_senha("REPORT_SENHA_EXTRA", "Senha dos ADMINS_EXTRA: ") if ADMINS_EXTRA else ""
    senha_genesis = pedir_senha("REPORT_SENHA_GENESIS", "Senha do perfil Genesis: ") if USUARIOS_GENESIS else ""

    chave_dados = AESGCM.generate_key(bit_length=256)
    iv_dados = os.urandom(12)
    dados = AESGCM(chave_dados).encrypt(
        iv_dados, json.dumps(linhas, ensure_ascii=False).encode("utf-8"), None
    )

    usuarios = {usuario.lower(): entrada_admin(usuario, senha, chave_dados) for usuario in USUARIOS}
    for usuario in ADMINS_EXTRA:
        usuarios[usuario.lower()] = entrada_admin(usuario, senha_extra, chave_dados, extra=True)
    if USUARIOS_GENESIS:
        usuarios.update(entradas_genesis(senha_genesis))

    pacote = {"versao": 1, "iteracoes": ITERACOES, "usuarios": usuarios,
              "iv": _b64(iv_dados), "dados": _b64(dados)}
    gravar(pacote)
    print(f"{len(linhas)} técnicos criptografados para {len(USUARIOS)} usuários "
          f"(+{len(ADMINS_EXTRA)} admins extra, +{len(USUARIOS_GENESIS)} Genesis) em {DESTINO}")


if __name__ == "__main__":
    main()
