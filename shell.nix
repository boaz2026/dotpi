{
  pkgs ? import <nixpkgs> { },
}:
pkgs.mkShell {
  nativeBuildInputs = with pkgs; [
    nodejs_22
    neovim
    git
  ];
  shellHook = ''
    export NPM_CONFIG_PREFIX="$PWD/.npm-global"
    export PATH="$NPM_CONFIG_PREFIX/bin:$PATH"
    if ! command -v pi &> /dev/null; then
    echo "Installing Pi coding agent..."
    npm install -g --ignore-scripts @earendil-works/pi-coding-agent
    fi

    echo "Pi coding agent environment is ready!"
  '';
}
