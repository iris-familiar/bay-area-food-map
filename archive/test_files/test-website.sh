#!/bin/bash
echo "Testing website..."

# Test 1: Check if server is running
if curl -s http://localhost:8080 > /dev/null; then
    echo "✓ Server is running"
else
    echo "✗ Server is not running"
    exit 1
fi

# Test 2: Check if database is accessible
if curl -s http://localhost:8080/data/current/restaurant_database.json | jq -e '.restaurants' > /dev/null; then
    count=$(curl -s http://localhost:8080/data/current/restaurant_database.json | jq '.restaurants | length')
    echo "✓ Database accessible with $count restaurants"
else
    echo "✗ Database not accessible"
    exit 1
fi

# Test 3: Check HTML structure
if curl -s http://localhost:8080 | grep -q 'id="loading"'; then
    echo "✓ Loading screen present"
else
    echo "✗ Loading screen missing"
fi

if curl -s http://localhost:8080 | grep -q 'id="content"'; then
    echo "✓ Content container present"
else
    echo "✗ Content container missing"
fi

# Test 4: Check JavaScript
curl -s http://localhost:8080 | grep -q "fetch('data/current/restaurant_database.json" && echo "✓ JS uses correct database path" || echo "✗ JS path issue"

echo ""
echo "Manual test: Open http://localhost:8080 in browser"
