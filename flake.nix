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
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = [ pkgs.nodejs_22 ];

          shellHook = ''
            echo "Welcome to agentmemory dev shell"
            export PATH="$PWD/node_modules/.bin:$PATH"

            if [ ! -d "node_modules" ]; then
              echo "Installing dependencies..."
              npm install --legacy-peer-deps
            fi
          '';
        };
      }
    );
}
