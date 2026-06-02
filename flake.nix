{
  description = "agentmemory - Persistent memory for AI coding agents";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};

        agentmemory = pkgs.buildNpmPackage {
          pname = "agentmemory";
          version = "0.9.24";
          src = ./.;

          npmDepsHash = "sha256-+fXZndf9P+h1SX+dQz7WQwyqAqMMKfXjV5u3Npn45Nk=";

          nativeBuildInputs = [ pkgs.nodejs_22 ];

          postPatch = ''
            echo "legacy-peer-deps=true" >> .npmrc
          '';

          NPM_CONFIG_IGNORE_SCRIPTS = "true";

          meta = {
            description = "Persistent memory for AI coding agents, powered by iii-engine's three primitives";
            homepage = "https://github.com/rohitg00/agentmemory";
            license = pkgs.lib.licenses.asl20;
            mainProgram = "agentmemory";
          };
        };
      in
      {
        packages = {
          default = agentmemory;
          source = agentmemory;
        };

        apps = {
          default = {
            type = "app";
            program = "${agentmemory}/bin/agentmemory";
          };
          source = {
            type = "app";
            program = "${agentmemory}/bin/agentmemory";
          };
        };

        overlays.default = final: prev: {
          agentmemory = agentmemory;
        };

        devShells.default = pkgs.mkShell {
          buildInputs = [ pkgs.nodejs_22 pkgs.git ];

          shellHook = ''
            echo "Welcome to agentmemory dev shell"
            export PATH="$PWD/node_modules/.bin:$PATH"

            if [ ! -d "node_modules" ]; then
              echo "Installing dependencies..."
              npm install --legacy-peer-deps
            fi
          '';
        };

        checks = {
          build = agentmemory;
        };
      }
    );
}
