import 'package:mcp_dart/mcp_dart.dart';
import '../build_version.dart';
import 'models.dart';
import 'providers.dart';

abstract class RemoteTools {
  Future<List<Json>> list(Json server);
  Future<Json> call(Json server, String tool, Json arguments);
}

class HttpMcpTools implements RemoteTools {
  Future<T> _session<T>(Json server, Future<T> Function(McpClient) work) async {
    final url = endpoint(server['url']);
    final client = McpClient(
      const Implementation(name: 'jingxu-mobile', version: jingxuVersion),
      options: const McpClientOptions(protocol: McpProtocol.stable),
    );
    final transport = StreamableHttpClientTransport(
      url,
      opts: StreamableHttpClientTransportOptions(
        requestInit: {
          'headers': {
            if ('${server['token'] ?? ''}'.isNotEmpty)
              'Authorization': 'Bearer ${server['token']}',
          },
        },
      ),
    );
    try {
      await client.connect(transport).timeout(const Duration(seconds: 20));
      return await work(client).timeout(const Duration(seconds: 60));
    } finally {
      await client.close();
    }
  }

  @override
  Future<List<Json>> list(Json server) => _session(
    server,
    (client) async =>
        (await client.listTools()).tools.map((t) => t.toJson()).toList(),
  );
  @override
  Future<Json> call(Json server, String tool, Json arguments) => _session(
    server,
    (client) async => (await client.callTool(
      CallToolRequest(name: tool, arguments: arguments),
    )).toJson(),
  );
}
