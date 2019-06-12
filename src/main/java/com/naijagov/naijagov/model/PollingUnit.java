package com.naijagov.naijagov.model;

import javax.persistence.Entity;
import javax.persistence.Id;

@Entity
public class PollingUnit {

    public String getDescription() {
        return description;
    }

    public int getCode() {
        return code;
    }

    public String getFullCode() {
        return fullCode;
    }

    public float getLongitude() {
        return longitude;
    }

    public float getLatitude() {
        return latitude;
    }

    public int getId() {
        return id;
    }

	private String description;
	private int code;
	private String fullCode;
	private float longitude;
    private float latitude;
    @Id
	private int id;
}