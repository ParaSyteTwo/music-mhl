import socket
import threading

import launcher


def test_internal_server_uses_available_dynamic_port():
    server = launcher.HTTPServer(('127.0.0.1', 0), launcher._SpaHandler)
    thread = threading.Thread(
        target=launcher._start_server,
        args=(server,),
        daemon=True,
    )
    thread.start()

    try:
        assert server.server_port > 0
        assert launcher._wait_for_server(server.server_port, timeout=2)
        with socket.create_connection(('127.0.0.1', server.server_port), timeout=1):
            pass
    finally:
        server.shutdown()
        server.server_close()
