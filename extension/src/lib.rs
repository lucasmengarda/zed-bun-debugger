use zed_extension_api::{
    download_file, make_file_executable, register_extension, DebugAdapterBinary, DebugConfig,
    DebugRequest, DebugScenario, DownloadedFileType, Extension, StartDebuggingRequestArguments,
    StartDebuggingRequestArgumentsRequest, Worktree,
};

struct BunDebuggerExtension;

impl Extension for BunDebuggerExtension {
    fn new() -> Self {
        Self
    }

    fn get_dap_binary(
        &mut self,
        _adapter_name: String,
        config: zed_extension_api::DebugTaskDefinition,
        user_provided_debug_adapter_path: Option<String>,
        _worktree: &Worktree,
    ) -> zed_extension_api::Result<DebugAdapterBinary, String> {
        let bridge_path = if let Some(path) = user_provided_debug_adapter_path {
            path
        } else if let Ok(path) = std::env::var("BUN_DEBUGGER_BRIDGE_PATH") {
            let bridge_path = std::path::PathBuf::from(&path);
            if !bridge_path.is_file() {
                return Err(format!(
                    "BUN_DEBUGGER_BRIDGE_PATH does not point to a bridge executable: {}",
                    path
                ));
            }
            path
        } else {
            let pwd = std::env::var("PWD").map_err(|e| format!("PWD not set: {}", e))?;
            let extension_dir = std::path::PathBuf::from(&pwd);

            let downloaded_bridge = extension_dir.join("bridge");
            let dev_bridge = extension_dir.join("bin/bridge");

            if downloaded_bridge.exists() {
                downloaded_bridge.to_string_lossy().to_string()
            } else if dev_bridge.exists() {
                dev_bridge.to_string_lossy().to_string()
            } else {
                // Must point at this fork: the upstream v0.1.0 asset predates the watch-mode
                // fixes, so falling back to it silently restores the broken behaviour.
                let version = "0.1.0";
                let url = format!(
                    "https://github.com/lucasmengarda/zed-bun-debugger/releases/download/v{}/bridge",
                    version
                );
                download_file(&url, "bridge", DownloadedFileType::Uncompressed)
                    .map_err(|e| format!("Failed to download bridge: {}", e))?;
                make_file_executable("bridge")
                    .map_err(|e| format!("Failed to make bridge executable: {}", e))?;
                downloaded_bridge.to_string_lossy().to_string()
            }
        };

        let request_args = StartDebuggingRequestArguments {
            configuration: config.config,
            request: StartDebuggingRequestArgumentsRequest::Launch,
        };

        Ok(DebugAdapterBinary {
            command: Some(bridge_path),
            arguments: Vec::new(),
            envs: Vec::new(),
            cwd: None,
            connection: None,
            request_args,
        })
    }

    fn dap_request_kind(
        &mut self,
        _adapter_name: String,
        config: serde_json::Value,
    ) -> zed_extension_api::Result<StartDebuggingRequestArgumentsRequest, String> {
        let request_type = config
            .get("request")
            .and_then(|v| v.as_str())
            .unwrap_or("launch");

        match request_type {
            "attach" => Ok(StartDebuggingRequestArgumentsRequest::Attach),
            _ => Ok(StartDebuggingRequestArgumentsRequest::Launch),
        }
    }

    fn dap_config_to_scenario(
        &mut self,
        config: DebugConfig,
    ) -> zed_extension_api::Result<DebugScenario, String> {
        let request = match config.request {
            DebugRequest::Launch(launch) => {
                let launch_config = serde_json::json!({
                    "type": "launch",
                    "request": "launch",
                    "name": config.label,
                    "program": launch.program,
                    "args": launch.args,
                    "cwd": launch.cwd,
                    "env": launch.envs.into_iter().collect::<std::collections::HashMap<String, String>>(),
                    "stopOnEntry": config.stop_on_entry.unwrap_or(false),
                });
                launch_config
            }
            DebugRequest::Attach(_attach) => {
                return Err("Attach is not supported by Bun debugger".to_string());
            }
        };

        let config_string = serde_json::to_string(&request)
            .map_err(|e| format!("Failed to serialize config: {}", e))?;

        Ok(DebugScenario {
            label: config.label,
            adapter: config.adapter,
            build: None,
            config: config_string,
            tcp_connection: None,
        })
    }
}

register_extension!(BunDebuggerExtension);
