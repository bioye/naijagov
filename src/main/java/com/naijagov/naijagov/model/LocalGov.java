package com.naijagov.naijagov.model;

import javax.persistence.Entity;
import javax.persistence.Id;

@Entity
public class LocalGov {
  
	@Id
	private int id;
	private String name;
	private int code;
    
	public String getName() {
		return name;
	}
	public int getCode() {
		return code;
	}
	public int getId() {
		return id;
  }
    
}
