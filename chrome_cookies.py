"""
Read cookies from Chrome's cookie database without admin privileges.
Opens the database in immutable mode to avoid Chrome's file lock.
Decrypts cookies using DPAPI + AES-GCM.
"""

import base64
import json
import os
import sqlite3

import win32crypt
from Cryptodome.Cipher import AES


def _get_chrome_user_data_dir():
    """Find Chrome's user data directory."""
    return os.path.join(os.environ["LOCALAPPDATA"], "Google", "Chrome", "User Data")


def _get_encryption_key():
    """Extract and decrypt Chrome's cookie encryption key from Local State."""
    local_state_path = os.path.join(_get_chrome_user_data_dir(), "Local State")

    with open(local_state_path, "r", encoding="utf-8") as f:
        local_state = json.load(f)

    encrypted_key = base64.b64decode(local_state["os_crypt"]["encrypted_key"])
    # Remove the "DPAPI" prefix (first 5 bytes)
    encrypted_key = encrypted_key[5:]
    # Decrypt using Windows DPAPI (works for the current user, no admin needed)
    key = win32crypt.CryptUnprotectData(encrypted_key, None, None, None, 0)[1]
    return key


def _decrypt_cookie_value(encrypted_value, key):
    """Decrypt a Chrome cookie value."""
    if not encrypted_value:
        return ""

    # Chrome v80+ uses AES-256-GCM with a "v10" or "v11" prefix
    if encrypted_value[:3] in (b"v10", b"v11"):
        nonce = encrypted_value[3:15]
        ciphertext_with_tag = encrypted_value[15:]
        ciphertext = ciphertext_with_tag[:-16]
        tag = ciphertext_with_tag[-16:]

        cipher = AES.new(key, AES.MODE_GCM, nonce=nonce)
        try:
            return cipher.decrypt_and_verify(ciphertext, tag).decode("utf-8")
        except Exception:
            return ""
    else:
        # Older Chrome versions use DPAPI directly
        try:
            return win32crypt.CryptUnprotectData(encrypted_value, None, None, None, 0)[1].decode("utf-8")
        except Exception:
            return ""


def _find_cookie_db():
    """Find Chrome's cookie database, trying all profiles."""
    user_data_dir = _get_chrome_user_data_dir()

    # Try Default profile first, then Profile 1, etc.
    profile_dirs = ["Default"] + [f"Profile {i}" for i in range(1, 6)]

    for profile in profile_dirs:
        candidate = os.path.join(user_data_dir, profile, "Network", "Cookies")
        if os.path.exists(candidate):
            return candidate

    raise FileNotFoundError("Could not find Chrome cookie database")


def _copy_locked_file(src, dst):
    """Copy a file that's locked by another process (e.g., Chrome).

    Uses Windows API with shared read/write/delete access.
    """
    import ctypes
    import ctypes.wintypes

    GENERIC_READ = 0x80000000
    FILE_SHARE_ALL = 0x7  # READ | WRITE | DELETE
    OPEN_EXISTING = 3
    FILE_ATTRIBUTE_NORMAL = 0x80
    INVALID_HANDLE_VALUE = ctypes.wintypes.HANDLE(-1).value

    kernel32 = ctypes.windll.kernel32

    h_src = kernel32.CreateFileW(
        src, GENERIC_READ, FILE_SHARE_ALL, None,
        OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, None,
    )

    if h_src == INVALID_HANDLE_VALUE:
        raise PermissionError(f"Cannot open locked file: {src}")

    try:
        file_size = os.stat(src).st_size
        buf = ctypes.create_string_buffer(file_size)
        bytes_read = ctypes.wintypes.DWORD(0)
        kernel32.ReadFile(h_src, buf, file_size, ctypes.byref(bytes_read), None)
    finally:
        kernel32.CloseHandle(h_src)

    with open(dst, "wb") as f:
        f.write(buf.raw[:bytes_read.value])


def _query_cookies(db_path, domain):
    """Open Chrome's cookie DB and query cookies.

    Copies the DB to a temp file first (Chrome locks the original while running).
    Falls back to Windows API if shutil.copy2 fails.

    Returns list of (host_key, name, encrypted_value, path) tuples (all bytes).
    """
    import shutil
    import tempfile

    temp_fd, temp_path = tempfile.mkstemp(suffix=".db")
    os.close(temp_fd)

    try:
        # Try normal copy first (works when Chrome is closed)
        try:
            shutil.copy2(db_path, temp_path)
        except PermissionError:
            # Chrome is running — try Windows API with shared access
            _copy_locked_file(db_path, temp_path)

        conn = sqlite3.connect(temp_path)
        conn.text_factory = bytes
        cursor = conn.cursor()
        cursor.execute(
            "SELECT host_key, name, encrypted_value, path FROM cookies WHERE host_key LIKE ?",
            (f"%{domain}%",),
        )
        rows = cursor.fetchall()
        conn.close()
        return rows
    finally:
        try:
            os.remove(temp_path)
        except Exception:
            pass


def get_chrome_cookies(domain):
    """
    Read cookies for a given domain from Chrome's cookie database.

    Args:
        domain: Domain to filter cookies for (e.g., ".utexas.edu")

    Returns:
        dict mapping cookie names to values
    """
    key = _get_encryption_key()
    cookie_db_path = _find_cookie_db()
    rows = _query_cookies(cookie_db_path, domain)

    cookies = {}
    for host_key, name, encrypted_value, path in rows:
        name = name.decode("utf-8") if isinstance(name, bytes) else name
        value = _decrypt_cookie_value(encrypted_value, key)
        if value:
            cookies[name] = value

    return cookies


def get_chrome_cookies_for_session(domain):
    """
    Read cookies with full domain/path info for use with requests.Session.

    Args:
        domain: Domain to filter cookies for (e.g., "utexas.edu")

    Returns:
        list of (name, value, domain, path) tuples
    """
    key = _get_encryption_key()
    cookie_db_path = _find_cookie_db()
    rows = _query_cookies(cookie_db_path, domain)

    cookies = []
    for host_key, name, encrypted_value, path in rows:
        host_key = host_key.decode("utf-8") if isinstance(host_key, bytes) else host_key
        name = name.decode("utf-8") if isinstance(name, bytes) else name
        path = path.decode("utf-8") if isinstance(path, bytes) else path
        value = _decrypt_cookie_value(encrypted_value, key)
        if value:
            cookies.append((name, value, host_key, path))

    return cookies
