#!/bin/bash

DATA=$(date '+%d/%m/%Y')

echo ""
echo "📚 Atualizar documentação — $DATA"
echo "──────────────────────────────────"
echo ""

# Mostra quais arquivos têm alteração
ALTERADOS=$(git -C "$(dirname "$0")/.." diff --name-only HEAD -- _docs/ && git -C "$(dirname "$0")/.." ls-files --others --exclude-standard _docs/)

if [ -z "$ALTERADOS" ]; then
  echo "Nenhuma alteração encontrada na pasta _docs/."
  echo ""
  exit 0
fi

echo "Arquivos com alterações:"
echo "$ALTERADOS" | while read -r f; do
  echo "  • $f"
done
echo ""

read -r -p "Confirmar commit? [s/N] " RESPOSTA
echo ""

if [[ ! "$RESPOSTA" =~ ^[Ss]$ ]]; then
  echo "Cancelado."
  echo ""
  exit 0
fi

git -C "$(dirname "$0")/.." add _docs/
git -C "$(dirname "$0")/.." commit -m "docs: atualização $DATA"
git -C "$(dirname "$0")/.." push

echo ""
echo "✅ Documentação salva com sucesso!"
echo ""
