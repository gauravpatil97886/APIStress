package postwomen

import "encoding/json"

// ExportCollection turns our internal model into a Postman v2.1 JSON document.
//
// `rootID` is the UUID of the root collection (used to look up its direct requests).
// `rootName` is the human-friendly name shown in info.name.
// `collections` is the descendant subtree (without the root itself).
// `requests` is keyed by collection_id (UUID).
func ExportCollection(rootID, rootName string, collections []Collection, requests map[string][]Request) ([]byte, error) {
	doc := map[string]interface{}{
		"info": map[string]interface{}{
			"name":        rootName,
			"schema":      "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
			"_postman_id": "00000000-0000-0000-0000-000000000000",
		},
		"item": buildItems(rootID, collections, requests),
	}
	return json.MarshalIndent(doc, "", "  ")
}

// buildItems walks the collection tree and emits postman items for the given root.
func buildItems(rootCollectionID string, all []Collection, byColl map[string][]Request) []interface{} {
	// Index collections by parent.
	byParent := map[string][]Collection{}
	for _, c := range all {
		key := ""
		if c.ParentID != nil {
			key = *c.ParentID
		}
		byParent[key] = append(byParent[key], c)
	}

	var walk func(parentID string) []interface{}
	walk = func(parentID string) []interface{} {
		out := []interface{}{}
		// Folders first, then leaf requests
		for _, c := range byParent[parentID] {
			node := map[string]interface{}{"name": c.Name}
			children := walk(c.ID)
			children = append(children, requestsToPostman(byColl[c.ID])...)
			node["item"] = children
			out = append(out, node)
		}
		return out
	}

	// Top-level: requests directly on the root + nested folders.
	top := []interface{}{}
	top = append(top, requestsToPostman(byColl[rootCollectionID])...)
	top = append(top, walk(rootCollectionID)...)
	return top
}

func requestsToPostman(reqs []Request) []interface{} {
	out := []interface{}{}
	for _, r := range reqs {
		headers := []map[string]interface{}{}
		for k, v := range r.Headers {
			headers = append(headers, map[string]interface{}{"key": k, "value": v})
		}
		query := []map[string]interface{}{}
		for _, q := range r.Query {
			query = append(query, map[string]interface{}{
				"key": q.Key, "value": q.Value, "disabled": !q.Enabled,
			})
		}
		urlObj := map[string]interface{}{"raw": r.URL}
		if len(query) > 0 {
			urlObj["query"] = query
		}
		req := map[string]interface{}{
			"method": r.Method,
			"header": headers,
			"url":    urlObj,
		}
		switch r.BodyKind {
		case "raw":
			req["body"] = map[string]interface{}{"mode": "raw", "raw": r.Body.Raw}
		case "json":
			req["body"] = map[string]interface{}{
				"mode": "raw", "raw": r.Body.Raw,
				"options": map[string]interface{}{"raw": map[string]interface{}{"language": "json"}},
			}
		case "urlencoded":
			arr := []map[string]interface{}{}
			for _, f := range r.Body.Form {
				arr = append(arr, map[string]interface{}{"key": f.Key, "value": f.Value, "disabled": !f.Enabled})
			}
			req["body"] = map[string]interface{}{"mode": "urlencoded", "urlencoded": arr}
		case "form-data":
			arr := []map[string]interface{}{}
			for _, f := range r.Body.Form {
				arr = append(arr, map[string]interface{}{"key": f.Key, "value": f.Value, "disabled": !f.Enabled, "type": f.Type})
			}
			req["body"] = map[string]interface{}{"mode": "formdata", "formdata": arr}
		case "graphql":
			if r.Body.GraphQL != nil {
				vars, _ := json.Marshal(r.Body.GraphQL.Variables)
				req["body"] = map[string]interface{}{
					"mode": "graphql",
					"graphql": map[string]interface{}{
						"query":     r.Body.GraphQL.Query,
						"variables": string(vars),
					},
				}
			}
		}
		switch r.Auth.Kind {
		case "bearer":
			req["auth"] = map[string]interface{}{
				"type": "bearer",
				"bearer": []map[string]interface{}{{"key": "token", "value": r.Auth.Token}},
			}
		case "basic":
			req["auth"] = map[string]interface{}{
				"type": "basic",
				"basic": []map[string]interface{}{
					{"key": "username", "value": r.Auth.User},
					{"key": "password", "value": r.Auth.Pass},
				},
			}
		case "api_key":
			req["auth"] = map[string]interface{}{
				"type": "apikey",
				"apikey": []map[string]interface{}{
					{"key": "key", "value": r.Auth.Key},
					{"key": "value", "value": r.Auth.Value},
					{"key": "in", "value": r.Auth.In},
				},
			}
		}
		out = append(out, map[string]interface{}{"name": r.Name, "request": req})
	}
	return out
}
